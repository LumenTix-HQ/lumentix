import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { Event, EventStatus } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { UserPreference } from './entities/user-preference.entity';
import { EventSimilarity } from './entities/event-similarity.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { RecommendationResponseDto, RecommendationDto } from './dto/recommendation-response.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

interface CollaborativeScore {
  eventId: string;
  score: number;
  reason: string;
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectRepository(UserPreference)
    private readonly preferenceRepo: Repository<UserPreference>,
    @InjectRepository(EventSimilarity)
    private readonly similarityRepo: Repository<EventSimilarity>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async generateRecommendations(
    userId: string,
    limit: number = 10,
  ): Promise<RecommendationResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    const pastTickets = await this.ticketRepo.find({
      where: { ownerId: userId, status: 'valid' },
      select: ['eventId'],
    });
    const pastEventIds = new Set(pastTickets.map((t) => t.eventId));

    const preferences = await this.preferenceRepo.find({ where: { userId } });
    const collaborativeScores = await this.computeCollaborativeScores(
      userId,
      pastEventIds,
    );
    const preferenceScores = await this.computePreferenceBasedScores(
      preferences,
      pastEventIds,
    );

    const combinedScores = this.combineScores(
      collaborativeScores,
      preferenceScores,
    );

    const sorted = combinedScores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const recommendedEvents = await this.eventRepo.find({
      where: { id: In(sorted.map((s) => s.eventId)), status: EventStatus.PUBLISHED },
    });

    const eventMap = new Map(recommendedEvents.map((e) => [e.id, e]));

    const recommendations: RecommendationDto[] = sorted
      .filter((s) => eventMap.has(s.eventId))
      .map((s) => {
        const event = eventMap.get(s.eventId)!;
        return {
          eventId: event.id,
          title: event.title,
          category: event.category,
          location: event.location ?? '',
          startDate: event.startDate.toISOString(),
          ticketPrice: Number(event.ticketPrice),
          currency: event.currency,
          score: s.score,
          reason: s.reason,
        };
      });

    await this.auditService.log({
      action: AuditAction.RECOMMENDATIONS_GENERATED,
      userId,
      resourceId: userId,
      metadata: { count: recommendations.length },
    });

    return {
      userId,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateUserPreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<{ updated: number }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    await this.preferenceRepo.delete({ userId });

    let count = 0;
    for (const entry of dto.preferences) {
      const pref = this.preferenceRepo.create({
        userId,
        category: entry.category ?? null,
        location: entry.location ?? null,
        weight: entry.weight,
        attendanceCount: 0,
      });
      await this.preferenceRepo.save(pref);
      count++;
    }

    await this.auditService.log({
      action: AuditAction.PREFERENCES_UPDATED,
      userId,
      resourceId: userId,
      metadata: { preferenceCount: count },
    });

    return { updated: count };
  }

  async trackEventSimilarity(): Promise<{ processed: number }> {
    const events = await this.eventRepo.find({
      where: { status: EventStatus.PUBLISHED },
    });

    let processed = 0;

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const eventA = events[i];
        const eventB = events[j];

        const score = this.computeSimilarityScore(eventA, eventB);
        if (score > 0) {
          const shared: string[] = [];
          if (eventA.category === eventB.category) shared.push('category');
          if (eventA.location && eventB.location &&
              eventA.location.toLowerCase() === eventB.location.toLowerCase()) {
            shared.push('location');
          }

          const existing = await this.similarityRepo.findOne({
            where: { eventId: eventA.id, similarEventId: eventB.id },
          });

          if (existing) {
            existing.similarityScore = score;
            existing.sharedAttributes = shared;
            await this.similarityRepo.save(existing);
          } else {
            await this.similarityRepo.save(
              this.similarityRepo.create({
                eventId: eventA.id,
                similarEventId: eventB.id,
                similarityScore: score,
                sharedAttributes: shared,
              }),
            );
          }

          const reverse = await this.similarityRepo.findOne({
            where: { eventId: eventB.id, similarEventId: eventA.id },
          });

          if (reverse) {
            reverse.similarityScore = score;
            reverse.sharedAttributes = shared;
            await this.similarityRepo.save(reverse);
          } else {
            await this.similarityRepo.save(
              this.similarityRepo.create({
                eventId: eventB.id,
                similarEventId: eventA.id,
                similarityScore: score,
                sharedAttributes: shared,
              }),
            );
          }

          processed++;
        }
      }
    }

    this.logger.log(`Tracked similarities for ${processed} event pairs`);
    return { processed };
  }

  async getSimilarEvents(
    eventId: string,
    limit: number = 5,
  ): Promise<RecommendationDto[]> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }

    const similarities = await this.similarityRepo.find({
      where: { eventId },
      order: { similarityScore: 'DESC' },
      take: limit,
    });

    if (similarities.length === 0) {
      return [];
    }

    const similarEventIds = similarities.map((s) => s.similarEventId);
    const similarEvents = await this.eventRepo.find({
      where: { id: In(similarEventIds) },
    });

    const eventMap = new Map(similarEvents.map((e) => [e.id, e]));

    return similarities
      .filter((s) => eventMap.has(s.similarEventId))
      .map((s) => {
        const e = eventMap.get(s.similarEventId)!;
        return {
          eventId: e.id,
          title: e.title,
          category: e.category,
          location: e.location ?? '',
          startDate: e.startDate.toISOString(),
          ticketPrice: Number(e.ticketPrice),
          currency: e.currency,
          score: Number(s.similarityScore),
          reason: s.sharedAttributes?.join(', ') ?? 'Similar event',
        };
      });
  }

  private async computeCollaborativeScores(
    userId: string,
    pastEventIds: Set<string>,
  ): Promise<CollaborativeScore[]> {
    if (pastEventIds.size === 0) {
      return [];
    }

    const similarUsers = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.ownerId', 'ownerId')
      .addSelect('COUNT(DISTINCT t.eventId)', 'commonEvents')
      .where('t.eventId IN (:...pastEventIds)', { pastEventIds: [...pastEventIds] })
      .andWhere('t.ownerId != :userId', { userId })
      .andWhere("t.status = 'valid'")
      .groupBy('t.ownerId')
      .having('COUNT(DISTINCT t.eventId) >= 1')
      .orderBy('COUNT(DISTINCT t.eventId)', 'DESC')
      .limit(20)
      .getRawMany();

    if (similarUsers.length === 0) {
      return [];
    }

    const similarUserIds = similarUsers.map((u) => u.ownerId);
    const theirTickets = await this.ticketRepo.find({
      where: {
        ownerId: In(similarUserIds),
        status: 'valid',
      },
      select: ['eventId', 'ownerId'],
    });

    const eventScores = new Map<string, { score: number; count: number }>();

    for (const ticket of theirTickets) {
      if (pastEventIds.has(ticket.eventId)) continue;

      const existing = eventScores.get(ticket.eventId) ?? { score: 0, count: 0 };
      existing.score += 1;
      existing.count += 1;
      eventScores.set(ticket.eventId, existing);
    }

    return [...eventScores.entries()]
      .map(([eventId, data]) => ({
        eventId,
        score: data.score / Math.max(similarUsers.length, 1),
        reason: `Attended by ${data.count} users with similar interests`,
      }))
      .filter((s) => s.score > 0);
  }

  private async computePreferenceBasedScores(
    preferences: UserPreference[],
    pastEventIds: Set<string>,
  ): Promise<CollaborativeScore[]> {
    if (preferences.length === 0) {
      return [];
    }

    const categoryPrefs = preferences.filter((p) => p.category && !p.location);
    const locationPrefs = preferences.filter((p) => p.location && !p.category);

    const now = new Date();
    const events = await this.eventRepo.find({
      where: {
        status: EventStatus.PUBLISHED,
        endDate: MoreThan(now),
      },
    });

    const scores: CollaborativeScore[] = [];

    for (const event of events) {
      if (pastEventIds.has(event.id)) continue;

      let totalScore = 0;
      let reasons: string[] = [];

      for (const pref of categoryPrefs) {
        if (pref.category === event.category) {
          totalScore += pref.weight * 2;
          reasons.push(`Matches preferred category: ${event.category}`);
        }
      }

      for (const pref of locationPrefs) {
        if (pref.location && event.location &&
            event.location.toLowerCase().includes(pref.location.toLowerCase())) {
          totalScore += pref.weight;
          reasons.push(`Matches preferred location: ${event.location}`);
        }
      }

      if (totalScore > 0) {
        scores.push({
          eventId: event.id,
          score: totalScore / 10,
          reason: reasons.join('; ') || 'Based on your preferences',
        });
      }
    }

    return scores;
  }

  private combineScores(
    collaborative: CollaborativeScore[],
    preference: CollaborativeScore[],
  ): CollaborativeScore[] {
    const combined = new Map<string, CollaborativeScore>();

    for (const score of collaborative) {
      combined.set(score.eventId, { ...score });
    }

    for (const score of preference) {
      const existing = combined.get(score.eventId);
      if (existing) {
        existing.score = existing.score * 0.6 + score.score * 0.4;
        existing.reason = `${existing.reason}; ${score.reason}`;
      } else {
        combined.set(score.eventId, { ...score, score: score.score * 0.4 });
      }
    }

    return [...combined.values()];
  }

  private computeSimilarityScore(
    eventA: Event,
    eventB: Event,
  ): number {
    let score = 0;
    let factors = 0;

    if (eventA.category === eventB.category) {
      score += 0.4;
      factors++;
    }

    if (eventA.location && eventB.location &&
        eventA.location.toLowerCase() === eventB.location.toLowerCase()) {
      score += 0.3;
      factors++;
    }

    const priceDiff = Math.abs(Number(eventA.ticketPrice) - Number(eventB.ticketPrice));
    const maxPrice = Math.max(Number(eventA.ticketPrice), Number(eventB.ticketPrice), 1);
    const priceSimilarity = 1 - Math.min(priceDiff / maxPrice, 1);
    score += priceSimilarity * 0.2;

    const currencyMatch = eventA.currency === eventB.currency ? 0.1 : 0;
    score += currencyMatch;

    return Math.min(score, 1);
  }
}
