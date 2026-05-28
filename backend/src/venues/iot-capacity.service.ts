import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';

import { IotSensor, SensorStatus, SensorType } from './entities/iot-sensor.entity';
import {
  VenueCapacitySnapshot,
  CapacityAlertLevel,
} from './entities/venue-capacity-snapshot.entity';
import { VenueSection } from './entities/venue-section.entity';
import { RegisterSensorDto } from './dto/register-sensor.dto';
import { SensorReadingDto } from './dto/sensor-reading.dto';
import { UpdateCapacityLimitsDto } from './dto/update-capacity-limits.dto';
import {
  CapacityMonitorDto,
  CapacityUpdateResultDto,
  SensorSummaryDto,
  SpaceOptimisationDto,
} from './dto/capacity-response.dto';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';

/** Thresholds used when the event has no custom overrides */
const DEFAULT_WARNING_PCT  = 70;
const DEFAULT_CRITICAL_PCT = 85;
const DEFAULT_OVER_PCT     = 95;

/** Minimum seconds between CRITICAL/OVER alert notifications per event */
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

@Injectable()
export class IotCapacityService {
  private readonly logger = new Logger(IotCapacityService.name);

  /** In-memory cooldown tracker: eventId → last alert timestamp */
  private readonly alertCooldown = new Map<string, number>();

  constructor(
    @InjectRepository(IotSensor)
    private readonly sensorRepo: Repository<IotSensor>,

    @InjectRepository(VenueCapacitySnapshot)
    private readonly snapshotRepo: Repository<VenueCapacitySnapshot>,

    @InjectRepository(VenueSection)
    private readonly sectionRepo: Repository<VenueSection>,

    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,

    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,

    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Sensor management
  // ─────────────────────────────────────────────────────────────────────────

  /** Register a new IoT sensor for an event. Returns the sensor + its API key (shown once). */
  async registerSensor(
    eventId: string,
    dto: RegisterSensorDto,
    requesterId: string,
  ): Promise<IotSensor & { apiKeyPlaintext: string }> {
    const event = await this.requireEvent(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can register sensors.');
    }
    if (dto.sectionId) {
      const section = await this.sectionRepo.findOne({ where: { id: dto.sectionId, eventId } });
      if (!section) throw new NotFoundException(`Section "${dto.sectionId}" not found for this event.`);
    }

    const apiKeyPlaintext = crypto.randomBytes(32).toString('hex');
    const apiKeyHashed    = crypto.createHash('sha256').update(apiKeyPlaintext).digest('hex');

    const sensor = this.sensorRepo.create({
      name:      dto.name,
      type:      dto.type,
      eventId,
      sectionId: dto.sectionId ?? null,
      location:  dto.location ?? null,
      apiKey:    apiKeyHashed,
      status:    SensorStatus.OFFLINE,
    });
    const saved = await this.sensorRepo.save(sensor);

    await this.auditService.log({
      action: 'IOT_SENSOR_REGISTERED',
      userId: requesterId,
      resourceId: saved.id,
      meta: { eventId, sensorType: dto.type, name: dto.name },
    });

    return { ...saved, apiKeyPlaintext };
  }

  /** Accept a reading from a sensor (authenticated by its API key). */
  async ingestReading(sensorId: string, apiKey: string, dto: SensorReadingDto): Promise<void> {
    const sensor = await this.sensorRepo
      .createQueryBuilder('s')
      .addSelect('s.apiKey')
      .where('s.id = :id', { id: sensorId })
      .getOne();

    if (!sensor) throw new NotFoundException(`Sensor "${sensorId}" not found.`);

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    if (keyHash !== sensor.apiKey) throw new UnauthorizedException('Invalid sensor API key.');
    if (!sensor.isActive) throw new BadRequestException('Sensor is deactivated.');

    // Update cumulative counters based on sensor type
    if (sensor.type === SensorType.ENTRY_COUNTER) {
      sensor.cumulativeEntries += dto.value;
    } else if (sensor.type === SensorType.EXIT_COUNTER) {
      sensor.cumulativeExits += dto.value;
    }

    sensor.lastReading   = dto.value;
    sensor.lastReadingAt = new Date();
    sensor.status        = dto.status ?? SensorStatus.ONLINE;

    await this.sensorRepo.save(sensor);

    // Trigger a capacity snapshot after every reading
    await this.monitorVenueCapacity(sensor.eventId).catch(err =>
      this.logger.error(`Snapshot failed after sensor reading for event ${sensor.eventId}`, err),
    );
  }

  async getSensors(eventId: string): Promise<IotSensor[]> {
    return this.sensorRepo.find({ where: { eventId }, order: { createdAt: 'ASC' } });
  }

  async deactivateSensor(sensorId: string, requesterId: string): Promise<IotSensor> {
    const sensor = await this.sensorRepo.findOne({ where: { id: sensorId } });
    if (!sensor) throw new NotFoundException(`Sensor "${sensorId}" not found.`);
    const event = await this.requireEvent(sensor.eventId);
    if (event.organizerId !== requesterId) throw new ForbiddenException('Only the organizer can deactivate sensors.');
    sensor.isActive = false;
    sensor.status   = SensorStatus.OFFLINE;
    return this.sensorRepo.save(sensor);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // monitor_venue_capacity
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Aggregate all active sensor readings for an event into a single
   * real-time capacity snapshot.
   *
   * Occupancy derivation logic:
   *  1. Sum entry_counter sensors → total entries
   *  2. Sum exit_counter sensors  → total exits
   *  3. net = entries - exits (floor 0)
   *  4. If occupancy sensors / camera_ai present, take their max as a
   *     cross-check and use the higher of the two values (conservative).
   *  5. Persist a VenueCapacitySnapshot and fire alerts if thresholds crossed.
   */
  async monitorVenueCapacity(eventId: string): Promise<CapacityMonitorDto> {
    const event   = await this.requireEvent(eventId);
    const sensors = await this.sensorRepo.find({ where: { eventId, isActive: true } });

    // ── Derive occupancy from sensors ──────────────────────────────────────
    let totalEntries  = 0;
    let totalExits    = 0;
    let directReading = 0; // from occupancy / camera_ai sensors

    const sectionOccupancy: Record<string, number> = {};

    for (const s of sensors) {
      if (s.status === SensorStatus.FAULT) continue; // skip faulty sensors

      switch (s.type) {
        case SensorType.ENTRY_COUNTER:
          totalEntries += s.cumulativeEntries;
          if (s.sectionId) sectionOccupancy[s.sectionId] = (sectionOccupancy[s.sectionId] ?? 0) + s.cumulativeEntries;
          break;
        case SensorType.EXIT_COUNTER:
          totalExits += s.cumulativeExits;
          if (s.sectionId) sectionOccupancy[s.sectionId] = (sectionOccupancy[s.sectionId] ?? 0) - s.cumulativeExits;
          break;
        case SensorType.OCCUPANCY:
        case SensorType.CAMERA_AI:
          directReading = Math.max(directReading, s.lastReading);
          if (s.sectionId) sectionOccupancy[s.sectionId] = Math.max(sectionOccupancy[s.sectionId] ?? 0, s.lastReading);
          break;
        case SensorType.ENVIRONMENTAL:
          // CO₂ proxy: treat as supplementary signal only (not used in primary count)
          break;
      }
    }

    const netFromCounters = Math.max(0, totalEntries - totalExits);
    const actualOccupancy = Math.max(netFromCounters, directReading);

    // Clamp section occupancy to >= 0
    for (const k of Object.keys(sectionOccupancy)) {
      sectionOccupancy[k] = Math.max(0, sectionOccupancy[k]);
    }

    // ── Tickets sold ───────────────────────────────────────────────────────
    const ticketsSold = await this.ticketRepo.count({
      where: { eventId, status: 'valid' },
    });

    // ── Alert level ────────────────────────────────────────────────────────
    const capacityLimit = event.maxAttendees ?? null;
    const occupancyPercent = capacityLimit
      ? Math.round((actualOccupancy / capacityLimit) * 10000) / 100
      : 0;

    const alertLevel = this.deriveAlertLevel(occupancyPercent);

    // ── Recommendations ────────────────────────────────────────────────────
    const recommendations = this.buildRecommendations(
      alertLevel, actualOccupancy, ticketsSold, capacityLimit, sectionOccupancy,
    );

    // ── Persist snapshot ───────────────────────────────────────────────────
    const snapshot = this.snapshotRepo.create({
      eventId,
      ticketsSold,
      actualOccupancy,
      capacityLimit,
      occupancyPercent,
      activeSensorCount: sensors.filter(s => s.status !== SensorStatus.FAULT).length,
      alertLevel,
      sectionBreakdown: Object.keys(sectionOccupancy).length > 0 ? sectionOccupancy : null,
      recommendations,
    });
    await this.snapshotRepo.save(snapshot);

    // ── Fire alert notifications (with cooldown) ───────────────────────────
    if (alertLevel === CapacityAlertLevel.CRITICAL || alertLevel === CapacityAlertLevel.OVER) {
      await this.maybeSendCapacityAlert(eventId, alertLevel, actualOccupancy, capacityLimit);
    }

    this.logger.log(
      `[IoT] event=${eventId} occupancy=${actualOccupancy} ` +
      `(${occupancyPercent}%) limit=${capacityLimit ?? '∞'} alert=${alertLevel}`,
    );

    return {
      eventId,
      ticketsSold,
      actualOccupancy,
      capacityLimit,
      occupancyPercent,
      remainingCapacity: capacityLimit !== null ? Math.max(0, capacityLimit - actualOccupancy) : null,
      alertLevel,
      activeSensorCount: snapshot.activeSensorCount,
      sensors: sensors.map(s => this.toSensorSummary(s)),
      sectionBreakdown: snapshot.sectionBreakdown,
      timestamp: snapshot.createdAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // optimize_space_usage
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Analyse current occupancy distribution across sections and generate
   * actionable space-optimisation recommendations.
   *
   * Algorithm:
   *  1. Fetch the latest snapshot for each section.
   *  2. Identify over-utilised sections (> criticalPct) and under-utilised ones (< 40%).
   *  3. Suggest crowd-flow redirections, section openings/closings, and staff deployments.
   *  4. Estimate time-to-critical based on the last N snapshots' trend.
   */
  async optimizeSpaceUsage(eventId: string): Promise<SpaceOptimisationDto> {
    await this.requireEvent(eventId);

    // Latest snapshot
    const latest = await this.snapshotRepo.findOne({
      where: { eventId },
      order: { createdAt: 'DESC' },
    });

    if (!latest) {
      // No sensor data yet — return empty optimisation
      return {
        eventId,
        occupancyPercent: 0,
        alertLevel: CapacityAlertLevel.NORMAL,
        recommendations: ['No sensor data available yet. Register and activate IoT sensors to enable optimisation.'],
        sectionUtilisation: {},
        rebalancingActions: [],
        estimatedMinutesToCritical: null,
      };
    }

    const sections = await this.sectionRepo.find({ where: { eventId } });
    const breakdown = latest.sectionBreakdown ?? {};

    // Build per-section utilisation
    const sectionUtilisation: SpaceOptimisationDto['sectionUtilisation'] = {};
    for (const section of sections) {
      const capacity   = section.rows * section.seatsPerRow;
      const occupancy  = breakdown[section.id] ?? 0;
      const utilisationPercent = capacity > 0 ? Math.round((occupancy / capacity) * 100) : 0;
      sectionUtilisation[section.name] = { occupancy, capacity, utilisationPercent };
    }

    // Identify hot and cold sections
    const overloaded  = Object.entries(sectionUtilisation).filter(([, v]) => v.utilisationPercent > 85);
    const underused   = Object.entries(sectionUtilisation).filter(([, v]) => v.utilisationPercent < 40);

    const rebalancingActions: string[] = [];
    for (const [name] of overloaded) {
      rebalancingActions.push(`Redirect incoming attendees away from "${name}" — currently over 85% full.`);
    }
    for (const [name, data] of underused) {
      const freeSlots = data.capacity - data.occupancy;
      rebalancingActions.push(`Open additional access to "${name}" — ${freeSlots} free slots available.`);
    }

    // Trend analysis: estimate minutes to critical
    const recentSnapshots = await this.snapshotRepo.find({
      where: { eventId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const estimatedMinutesToCritical = this.estimateMinutesToCritical(
      recentSnapshots.map(s => ({ pct: Number(s.occupancyPercent), ts: s.createdAt })),
    );

    const recommendations = this.buildRecommendations(
      latest.alertLevel,
      latest.actualOccupancy,
      latest.ticketsSold,
      latest.capacityLimit,
      breakdown,
    );

    if (rebalancingActions.length > 0) {
      recommendations.push(...rebalancingActions);
    }

    return {
      eventId,
      occupancyPercent: Number(latest.occupancyPercent),
      alertLevel: latest.alertLevel,
      recommendations: [...new Set(recommendations)],
      sectionUtilisation,
      rebalancingActions,
      estimatedMinutesToCritical,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // update_capacity_limits
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Dynamically update the hard capacity limit for an event based on
   * real-time IoT data or organizer/safety-officer decision.
   *
   * Side effects:
   *  - Updates event.maxAttendees in the database.
   *  - If pauseSalesAtLimit=true and current occupancy >= new limit, pauses ticket sales.
   *  - Writes an audit log entry with the reason.
   *  - Triggers a fresh capacity snapshot.
   */
  async updateCapacityLimits(
    eventId: string,
    dto: UpdateCapacityLimitsDto,
    requesterId: string,
  ): Promise<CapacityUpdateResultDto> {
    const event = await this.requireEvent(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can update capacity limits.');
    }

    const previousLimit = event.maxAttendees;
    const newLimit      = dto.maxAttendees === 0 ? null : dto.maxAttendees;

    // Validate: new limit must not be below current actual occupancy
    if (newLimit !== null) {
      const latestSnapshot = await this.snapshotRepo.findOne({
        where: { eventId },
        order: { createdAt: 'DESC' },
      });
      if (latestSnapshot && latestSnapshot.actualOccupancy > newLimit) {
        throw new BadRequestException(
          `Cannot set capacity to ${newLimit} — current occupancy is ` +
          `${latestSnapshot.actualOccupancy} (already exceeds new limit).`,
        );
      }
    }

    // Persist the new limit
    await this.eventRepo.update({ id: eventId }, { maxAttendees: newLimit });

    // Determine if sales should be paused
    let salesPaused = false;
    if (dto.pauseSalesAtLimit && newLimit !== null) {
      const ticketsSold = await this.ticketRepo.count({ where: { eventId, status: 'valid' } });
      if (ticketsSold >= newLimit) {
        salesPaused = true;
        this.logger.warn(`[IoT] Ticket sales effectively paused for event ${eventId} — sold=${ticketsSold} limit=${newLimit}`);
      }
    }

    const audit = await this.auditService.log({
      action: 'CAPACITY_LIMIT_UPDATED',
      userId: requesterId,
      resourceId: eventId,
      meta: {
        previousLimit,
        newLimit,
        reason: dto.reason ?? 'No reason provided',
        warningThresholdPercent:  dto.warningThresholdPercent  ?? DEFAULT_WARNING_PCT,
        criticalThresholdPercent: dto.criticalThresholdPercent ?? DEFAULT_CRITICAL_PCT,
        salesPaused,
      },
    });

    this.logger.log(
      `[IoT] Capacity updated: event=${eventId} ${previousLimit ?? '∞'} → ${newLimit ?? '∞'} ` +
      `reason="${dto.reason ?? 'n/a'}"`,
    );

    // Refresh snapshot with new limit
    await this.monitorVenueCapacity(eventId).catch(() => undefined);

    return { newLimit, previousLimit, salesPaused, auditId: audit.id };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /** Return the most recent N snapshots for trend charts. */
  async getCapacityHistory(eventId: string, limit = 60): Promise<VenueCapacitySnapshot[]> {
    await this.requireEvent(eventId);
    return this.snapshotRepo.find({
      where: { eventId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 500),
    });
  }

  /** Return the latest single snapshot. */
  async getLatestSnapshot(eventId: string): Promise<VenueCapacitySnapshot | null> {
    await this.requireEvent(eventId);
    return this.snapshotRepo.findOne({
      where: { eventId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scheduled polling — runs every 2 minutes for all live events
  // ─────────────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_2_MINUTES)
  async pollAllLiveEvents(): Promise<void> {
    // Find events that are currently running (started but not yet ended)
    const now = new Date();
    const liveEvents = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.status = :status', { status: 'published' })
      .andWhere('e.startDate <= :now', { now })
      .andWhere('e.endDate >= :now', { now })
      .select(['e.id'])
      .getMany();

    for (const event of liveEvents) {
      await this.monitorVenueCapacity(event.id).catch(err =>
        this.logger.error(`Scheduled poll failed for event ${event.id}`, err),
      );
    }

    if (liveEvents.length > 0) {
      this.logger.debug(`[IoT] Polled ${liveEvents.length} live event(s)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async requireEvent(eventId: string): Promise<Event> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Event "${eventId}" not found.`);
    return event;
  }

  private deriveAlertLevel(occupancyPercent: number): CapacityAlertLevel {
    if (occupancyPercent >= DEFAULT_OVER_PCT)     return CapacityAlertLevel.OVER;
    if (occupancyPercent >= DEFAULT_CRITICAL_PCT) return CapacityAlertLevel.CRITICAL;
    if (occupancyPercent >= DEFAULT_WARNING_PCT)  return CapacityAlertLevel.WARNING;
    return CapacityAlertLevel.NORMAL;
  }

  private buildRecommendations(
    alertLevel: CapacityAlertLevel,
    actualOccupancy: number,
    ticketsSold: number,
    capacityLimit: number | null,
    sectionBreakdown: Record<string, number>,
  ): string[] {
    const recs: string[] = [];

    if (alertLevel === CapacityAlertLevel.OVER) {
      recs.push('URGENT: Venue is over capacity. Stop all entry immediately and contact safety officers.');
      recs.push('Activate overflow areas or adjacent spaces if available.');
      recs.push('Deploy additional staff to manage crowd flow at all entry points.');
    } else if (alertLevel === CapacityAlertLevel.CRITICAL) {
      recs.push('Capacity is critical (>85%). Slow entry rate and prepare overflow procedures.');
      recs.push('Alert security staff to monitor all entry and exit points.');
      recs.push('Consider pausing ticket scanning temporarily to allow crowd to settle.');
    } else if (alertLevel === CapacityAlertLevel.WARNING) {
      recs.push('Capacity is approaching limit (>70%). Monitor entry rate closely.');
      recs.push('Ensure all exits are clearly marked and unobstructed.');
    }

    if (capacityLimit !== null && ticketsSold > capacityLimit) {
      recs.push(`Warning: ${ticketsSold - capacityLimit} more tickets sold than current capacity limit. Review ticket sales settings.`);
    }

    const noSensorData = Object.keys(sectionBreakdown).length === 0;
    if (noSensorData && alertLevel === CapacityAlertLevel.NORMAL) {
      recs.push('No IoT sensor data available. Install entry/exit counters for real-time monitoring.');
    }

    return recs;
  }

  private estimateMinutesToCritical(
    points: Array<{ pct: number; ts: Date }>,
  ): number | null {
    if (points.length < 3) return null;

    // Simple linear regression on the last N points
    const sorted = [...points].sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const n = sorted.length;
    const xs = sorted.map((_, i) => i);
    const ys = sorted.map(p => p.pct);

    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;

    const slope = xs.reduce((acc, x, i) => acc + (x - xMean) * (ys[i] - yMean), 0) /
                  xs.reduce((acc, x) => acc + Math.pow(x - xMean, 2), 0);

    if (slope <= 0) return null; // not trending upward

    const currentPct = sorted[n - 1].pct;
    if (currentPct >= DEFAULT_CRITICAL_PCT) return 0;

    const intervalsToGo = (DEFAULT_CRITICAL_PCT - currentPct) / slope;
    const avgIntervalMs = (sorted[n - 1].ts.getTime() - sorted[0].ts.getTime()) / (n - 1);
    const msToGo = intervalsToGo * avgIntervalMs;

    return Math.round(msToGo / 60_000);
  }

  private async maybeSendCapacityAlert(
    eventId: string,
    alertLevel: CapacityAlertLevel,
    occupancy: number,
    limit: number | null,
  ): Promise<void> {
    const now = Date.now();
    const lastAlert = this.alertCooldown.get(eventId) ?? 0;
    if (now - lastAlert < ALERT_COOLDOWN_MS) return;

    this.alertCooldown.set(eventId, now);

    await this.auditService.log({
      action: 'CAPACITY_ALERT_FIRED',
      userId: 'system',
      resourceId: eventId,
      meta: { alertLevel, occupancy, limit },
    });

    this.logger.warn(
      `[IoT] CAPACITY ALERT [${alertLevel.toUpperCase()}] event=${eventId} ` +
      `occupancy=${occupancy}/${limit ?? '∞'}`,
    );
  }

  private toSensorSummary(s: IotSensor): SensorSummaryDto {
    return {
      id:                s.id,
      name:              s.name,
      type:              s.type,
      status:            s.status,
      lastReading:       s.lastReading,
      lastReadingAt:     s.lastReadingAt,
      cumulativeEntries: s.cumulativeEntries,
      cumulativeExits:   s.cumulativeExits,
      sectionId:         s.sectionId,
      location:          s.location,
    };
  }
}
