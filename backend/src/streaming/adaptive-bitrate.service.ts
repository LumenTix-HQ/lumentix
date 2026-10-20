import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { StreamingConfig } from './entities/streaming-config.entity';
import { ViewerStreamSession } from './entities/viewer-stream-session.entity';
import {
  BitrateTierDto,
  DetectViewerBandwidthDto,
  ReportBufferingEventDto,
  SwitchBitrateTierDto,
  ViewerStreamStateDto,
} from './dto/adaptive-bitrate.dto';

/**
 * Weight given to the newest bandwidth sample when smoothing. Low enough that
 * a single slow segment does not drop the viewer a tier, high enough that a
 * sustained change is picked up within a few segments.
 */
const BANDWIDTH_SMOOTHING_ALPHA = 0.4;

/**
 * A tier is only selected when smoothed bandwidth exceeds its bitrate by this
 * factor, leaving headroom so playback is not sitting exactly at capacity.
 */
const BANDWIDTH_HEADROOM = 1.25;

/** Stalls within this window still count toward the recent-buffering penalty. */
const BUFFERING_WINDOW_MS = 60_000;

/**
 * Consecutive recent stalls that force a downward step regardless of measured
 * bandwidth. Two stalls in a minute means the estimate is wrong.
 */
const STALLS_BEFORE_FORCED_DOWNSWITCH = 2;

@Injectable()
export class AdaptiveBitrateService {
  private readonly logger = new Logger(AdaptiveBitrateService.name);

  constructor(
    @InjectRepository(ViewerStreamSession)
    private readonly sessionRepo: Repository<ViewerStreamSession>,
    @InjectRepository(StreamingConfig)
    private readonly streamingRepo: Repository<StreamingConfig>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Record a bandwidth measurement from the viewer's player and return the
   * resulting playback state, re-selecting the tier unless the viewer has
   * pinned one manually.
   */
  async detectViewerBandwidth(
    eventId: string,
    viewerId: string,
    dto: DetectViewerBandwidthDto,
  ): Promise<ViewerStreamStateDto> {
    const config = await this.requireStreamingConfig(eventId);
    const session = await this.loadOrCreateSession(eventId, viewerId);

    session.measuredBandwidthKbps = dto.measuredBandwidthKbps;
    session.smoothedBandwidthKbps = this.smooth(
      session.smoothedBandwidthKbps,
      dto.measuredBandwidthKbps,
    );

    const tiers = this.ladderFor(config);
    const reason = this.applyAutomaticTier(session, tiers, 'bandwidth');

    const saved = await this.sessionRepo.save(session);
    return this.toState(saved, config, tiers, reason);
  }

  /**
   * Pin a tier manually, or clear the pin to return to automatic selection.
   *
   * A pinned tier is honoured even when bandwidth cannot sustain it — the
   * viewer asked for it, and silently overriding the choice is what a manual
   * control exists to prevent.
   */
  async switchBitrateTier(
    eventId: string,
    viewerId: string,
    dto: SwitchBitrateTierDto,
  ): Promise<ViewerStreamStateDto> {
    const config = await this.requireStreamingConfig(eventId);
    const session = await this.loadOrCreateSession(eventId, viewerId);
    const tiers = this.ladderFor(config);

    const requested = dto.tier ?? null;

    if (requested === null || requested.toLowerCase() === 'auto') {
      session.manualTierOverride = null;
      const reason = this.applyAutomaticTier(session, tiers, 'auto-resumed');
      const saved = await this.sessionRepo.save(session);
      this.logger.log(
        `Viewer ${viewerId} resumed adaptive bitrate for event ${eventId}`,
      );
      return this.toState(saved, config, tiers, reason);
    }

    const tier = tiers.find((candidate) => candidate.profile === requested);
    if (!tier) {
      throw new BadRequestException(
        `Unknown bitrate tier "${requested}". Available tiers: ${tiers
          .map((candidate) => candidate.profile)
          .join(', ')}.`,
      );
    }

    this.recordSwitch(session, tier.profile, 'manual');
    session.manualTierOverride = tier.profile;
    session.currentTier = tier.profile;
    session.currentBitrateKbps = tier.bitrateKbps;

    const saved = await this.sessionRepo.save(session);
    this.logger.log(
      `Viewer ${viewerId} pinned tier ${tier.profile} for event ${eventId}`,
    );

    return this.toState(saved, config, tiers, 'manual');
  }

  /**
   * Record a playback stall.
   *
   * Repeated stalls are treated as evidence that the bandwidth estimate is
   * optimistic, so the smoothed estimate is cut and — once the session crosses
   * the stall threshold — the viewer is stepped down a tier. A viewer on a
   * manual override is not moved; the stall is still recorded so the organizer
   * sees it in the metrics.
   */
  async reportBufferingEvent(
    eventId: string,
    viewerId: string,
    dto: ReportBufferingEventDto,
  ): Promise<ViewerStreamStateDto> {
    const config = await this.requireStreamingConfig(eventId);
    const session = await this.loadOrCreateSession(eventId, viewerId);
    const tiers = this.ladderFor(config);

    const now = new Date();
    const withinWindow =
      session.lastBufferingAt !== null &&
      now.getTime() - new Date(session.lastBufferingAt).getTime() <=
        BUFFERING_WINDOW_MS;

    session.bufferingEventCount = withinWindow
      ? session.bufferingEventCount + 1
      : 1;
    session.totalBufferingMs += dto.stalledMs;
    session.lastBufferingAt = now;

    // A stall means the stream outran the connection, so trust the estimate
    // less than the evidence.
    session.smoothedBandwidthKbps = Math.max(
      1,
      Math.round(session.smoothedBandwidthKbps * 0.75),
    );

    let reason = 'buffering';

    if (session.manualTierOverride) {
      reason = 'manual';
    } else if (session.bufferingEventCount >= STALLS_BEFORE_FORCED_DOWNSWITCH) {
      const stepped = this.stepDown(session.currentTier, tiers);
      if (stepped && stepped.profile !== session.currentTier) {
        this.recordSwitch(session, stepped.profile, 'buffering');
        session.currentTier = stepped.profile;
        session.currentBitrateKbps = stepped.bitrateKbps;
      }
    } else {
      reason = this.applyAutomaticTier(session, tiers, 'bandwidth');
    }

    const saved = await this.sessionRepo.save(session);
    await this.recordStallOnEventMetrics(config, dto.stalledMs);

    return this.toState(saved, config, tiers, reason);
  }

  /** Current playback state without recording anything. */
  async getViewerStreamState(
    eventId: string,
    viewerId: string,
  ): Promise<ViewerStreamStateDto> {
    const config = await this.requireStreamingConfig(eventId);
    const session = await this.loadOrCreateSession(eventId, viewerId);
    const tiers = this.ladderFor(config);

    return this.toState(
      session,
      config,
      tiers,
      session.manualTierOverride ? 'manual' : 'bandwidth',
    );
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private async requireStreamingConfig(eventId: string): Promise<StreamingConfig> {
    const config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config || !config.streamUrl) {
      throw new NotFoundException(
        'Streaming is not configured for this event. Call manageContentDelivery first.',
      );
    }
    return config;
  }

  private async loadOrCreateSession(
    eventId: string,
    viewerId: string,
  ): Promise<ViewerStreamSession> {
    const existing = await this.sessionRepo.findOne({
      where: { eventId, viewerId },
    });
    if (existing) return existing;

    return this.sessionRepo.create({
      eventId,
      viewerId,
      measuredBandwidthKbps: 0,
      smoothedBandwidthKbps: 0,
      currentTier: 'auto',
      currentBitrateKbps: 0,
      manualTierOverride: null,
      bufferingEventCount: 0,
      totalBufferingMs: 0,
      lastBufferingAt: null,
      switchHistory: [],
    });
  }

  /**
   * The organizer's ladder, highest bitrate first. Falls back to a ladder
   * derived from the configured target when none has been built yet.
   */
  private ladderFor(config: StreamingConfig): BitrateTierDto[] {
    const stored = config.deliveryConfig?.ladder;

    const ladder: BitrateTierDto[] = Array.isArray(stored)
      ? (stored as BitrateTierDto[]).filter(
          (tier) =>
            typeof tier?.profile === 'string' &&
            Number.isFinite(Number(tier?.bitrateKbps)),
        )
      : [];

    if (ladder.length > 0) {
      return [...ladder].sort((a, b) => b.bitrateKbps - a.bitrateKbps);
    }

    const peak = Math.max(config.targetBitrateKbps || 2_500, 1_500);
    return [
      { profile: '1080p', bitrateKbps: Math.round(peak) },
      { profile: '720p', bitrateKbps: Math.round(peak * 0.55) },
      { profile: '480p', bitrateKbps: Math.round(peak * 0.3) },
    ];
  }

  private smooth(previous: number, sample: number): number {
    if (previous <= 0) return sample;
    return Math.round(
      previous * (1 - BANDWIDTH_SMOOTHING_ALPHA) + sample * BANDWIDTH_SMOOTHING_ALPHA,
    );
  }

  /** Highest tier the smoothed bandwidth can sustain, with headroom. */
  private selectTier(
    smoothedBandwidthKbps: number,
    tiers: BitrateTierDto[],
  ): BitrateTierDto {
    const affordable = tiers.find(
      (tier) => smoothedBandwidthKbps >= tier.bitrateKbps * BANDWIDTH_HEADROOM,
    );

    // Below the lowest tier there is nothing to fall back to — serving the
    // lowest is still better than serving nothing.
    return affordable ?? tiers[tiers.length - 1];
  }

  /** One tier below `currentTier`, or the current one when already lowest. */
  private stepDown(
    currentTier: string,
    tiers: BitrateTierDto[],
  ): BitrateTierDto | null {
    const index = tiers.findIndex((tier) => tier.profile === currentTier);
    if (index === -1) return tiers[tiers.length - 1];
    if (index >= tiers.length - 1) return tiers[index];
    return tiers[index + 1];
  }

  /**
   * Apply automatic tier selection, unless a manual override is pinned.
   * Returns the reason the resulting tier is being served.
   */
  private applyAutomaticTier(
    session: ViewerStreamSession,
    tiers: BitrateTierDto[],
    reason: string,
  ): string {
    if (session.manualTierOverride) {
      const pinned = tiers.find(
        (tier) => tier.profile === session.manualTierOverride,
      );
      if (pinned) {
        session.currentTier = pinned.profile;
        session.currentBitrateKbps = pinned.bitrateKbps;
      }
      return 'manual';
    }

    const selected = this.selectTier(session.smoothedBandwidthKbps, tiers);
    if (selected.profile !== session.currentTier) {
      this.recordSwitch(session, selected.profile, reason);
    }

    session.currentTier = selected.profile;
    session.currentBitrateKbps = selected.bitrateKbps;
    return reason;
  }

  private recordSwitch(
    session: ViewerStreamSession,
    toTier: string,
    reason: string,
  ): void {
    session.switchHistory = [
      ...(session.switchHistory ?? []),
      {
        at: new Date().toISOString(),
        fromTier: session.currentTier,
        toTier,
        reason,
      },
    ].slice(-50);
  }

  /** Roll the stall into the organizer-facing performance metrics. */
  private async recordStallOnEventMetrics(
    config: StreamingConfig,
    stalledMs: number,
  ): Promise<void> {
    const stored = config.performanceMetrics ?? {};
    const priorStalls = Number(stored.bufferingEvents) || 0;
    const priorMs = Number(stored.totalBufferingMs) || 0;

    config.performanceMetrics = {
      ...stored,
      bufferingEvents: priorStalls + 1,
      totalBufferingMs: priorMs + stalledMs,
      lastBufferingAt: new Date().toISOString(),
    };

    await this.streamingRepo.save(config);
  }

  private toState(
    session: ViewerStreamSession,
    config: StreamingConfig,
    tiers: BitrateTierDto[],
    lastSwitchReason: string,
  ): ViewerStreamStateDto {
    const cdn =
      config.cdnBaseUrl ??
      this.configService.get<string>('CDN_BASE_URL') ??
      'https://cdn.lumentix.local';

    return {
      eventId: session.eventId,
      viewerId: session.viewerId,
      measuredBandwidthKbps: session.measuredBandwidthKbps,
      smoothedBandwidthKbps: session.smoothedBandwidthKbps,
      currentTier: session.currentTier,
      currentBitrateKbps: session.currentBitrateKbps,
      manualTierOverride: session.manualTierOverride,
      adaptiveEnabled: session.manualTierOverride === null,
      bufferingEventCount: session.bufferingEventCount,
      totalBufferingMs: session.totalBufferingMs,
      availableTiers: tiers,
      lastSwitchReason,
      playbackUrl: `${cdn}/events/${session.eventId}/${session.currentTier}.m3u8`,
    };
  }
}
