import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserPreference } from './entities/user-preference.entity';
import { EventSimilarity } from './entities/event-similarity.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { Registration, RegistrationStatus } from '../registrations/entities/registration.entity';
import {
  RecommendationDto,
  RecommendationResponse,
} from './dto/recommendation-response.dto';
import {
  UpdateUserPreferencesDto,
  UpdateUserPreferencesResultDto,
} from './dto/update-user-preferences.dto';

/**
 * Weighted profile built from a user's stored preferences AND their purchase /
 * registration history. Category weights are the raw sum of preference weights;
 * location weights are scaled by 0.6 so a location match contributes less than
 * a category match (#1243, #1465).
 *
 * The `attendedEventIds` set is used by the collaborative-filtering stage to
 * find similar attendees and avoid recommending events the user already
 * registered for.
 */
export interface UserProfileVector {
  categoryWeights: Record<string, number>;
  locationWeights: Record<string, number>;
  /** IDs of events the user has already attended / registered for (#1465). */
  attendedEventIds: Set<string>;
}

/** A candidate event paired with its computed relevance score. */
export interface ScoredEvent {
  eventId: string;
  event: Event;
  score: number;
  /** Breakdown of the score components for transparency (#1465). */
  scoreBreakdown?: {
    contentScore: number;
    collaborativeScore: number;
  };
}

const LOCATION_WEIGHT_FACTOR = 0.6;
/** Weight applied to the collaborative filtering score component (#1465). */
const COLLABORATIVE_WEIGHT = 0.4;
/** Weight applied to the content-based score component (#1465). */
const CONTENT_WEIGHT = 0.6;
/** How many similar attendees to consider when computing collaborative scores. */
const MAX_SIMILAR_USERS = 50;

/**
 * Ranked, per-user event suggestions combining content-based filtering from
 * the implicit preference profile (`user_preferences`) with collaborative
 * filtering derived from purchase/registration history and attendee similarity
 * — issues #1243 and #1465.
 *
 * Scoring pipeline:
 *   1. buildUserProfileVector   — collapse `user_preferences` rows into
 *      weighted category/location buckets AND load the user's attended-event
 *      set from `registrations`.
 *   2. computeSimilarityScores  — score every candidate event by overlap with
 *      the profile vector (content-based component) plus a collaborative
 *      signal from similar attendees (collaborative-filtering component).
 *   3. rankRecommendations      — sort candidates descending by combined score,
 *      filter out already-attended events, slice to limit.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(UserPreference)
    private readonly preferencesRepo: Repository<UserPreference>,
    @InjectRepository(EventSimilarity)
    private readonly similaritiesRepo: Repository<EventSimilarity>,
    @InjectRepository(Event)
    private readonly eventsRepo: Repository<Event>,
    @InjectRepository(Registration)
    private readonly registrationsRepo: Repository<Registration>,
  ) {}

  /**
   * 1. Build the user's implicit profile vector from their stored preferences
   *    AND their confirmed registration history (#1465).
   *
   *    Each preference row contributes its `weight` to the matching category
   *    bucket and `0.6 * weight` to the matching location bucket.
   *
   *    Confirmed registrations are used to:
   *      a) Populate `attendedEventIds` so already-attended events are filtered
   *         out of final recommendations.
   *      b) Boost category/location weights by `attendanceCount`-style signals
   *         derived from real purchase history (each confirmed registration
   *         adds 1 implicit point to its event's category and location).
   */
  async buildUserProfileVector(userId: string): Promise<UserProfileVector> {
    const prefs = await this.preferencesRepo.find({ where: { userId } });

    const categoryWeights: Record<string, number> = {};
    const locationWeights: Record<string, number> = {};
    const attendedEventIds = new Set<string>();

    for (const pref of prefs) {
      const weight = pref.weight ?? 0;
      if (pref.category) {
        categoryWeights[pref.category] =
          (categoryWeights[pref.category] ?? 0) + weight;
      }
      if (pref.location) {
        locationWeights[pref.location] =
          (locationWeights[pref.location] ?? 0) +
          LOCATION_WEIGHT_FACTOR * weight;
      }
    }

    // Enrich with confirmed purchase/registration history (#1465).
    const registrations = await this.registrationsRepo.find({
      where: { userId, status: RegistrationStatus.CONFIRMED },
    });

    if (registrations.length > 0) {
      // Bulk-load the attended events to extract their category/location.
      const attendedEventIdList = registrations.map((r) => r.eventId);
      for (const id of attendedEventIdList) attendedEventIds.add(id);

      const attendedEvents = await this.eventsRepo
        .createQueryBuilder('event')
        .where('event.id IN (:...ids)', { ids: attendedEventIdList })
        .getMany();

      for (const event of attendedEvents) {
        // Each attended event contributes 1 implicit weight point.
        if (event.category) {
          categoryWeights[event.category] =
            (categoryWeights[event.category] ?? 0) + 1;
        }
        if (event.location) {
          locationWeights[event.location] =
            (locationWeights[event.location] ?? 0) + LOCATION_WEIGHT_FACTOR;
        }
      }
    }

    return { categoryWeights, locationWeights, attendedEventIds };
  }

  /** Candidate events are the published events that can be recommended. */
  async listCandidateEvents(): Promise<Event[]> {
    return this.eventsRepo.find({ where: { status: EventStatus.PUBLISHED } });
  }

  /**
   * 2. Score every candidate event against the profile vector using a hybrid
   *    of content-based and collaborative filtering (#1465).
   *
   *    Content score:
   *      - Category match → full category weight.
   *      - Location match → scaled location weight.
   *
   *    Collaborative score:
   *      - Find up to `MAX_SIMILAR_USERS` other users who attended the same
   *        events as this user (co-attendance overlap).
   *      - Count how many of those similar users attended each candidate event.
   *      - Normalise by MAX_SIMILAR_USERS to yield a [0,1] collaborative score.
   *
   *    Final score = CONTENT_WEIGHT * contentScore + COLLABORATIVE_WEIGHT * collaborativeScore.
   */
  async computeSimilarityScores(
    vector: UserProfileVector,
    events: Event[],
  ): Promise<ScoredEvent[]> {
    // Build collaborative signal: co-attendance map eventId → normalised score.
    const collaborativeScores = await this._computeCollaborativeScores(
      vector.attendedEventIds,
      events,
    );

    const scored: ScoredEvent[] = [];

    for (const event of events) {
      // Skip events the user already attended.
      if (vector.attendedEventIds.has(event.id)) continue;

      let contentScore = 0;
      if (event.category && vector.categoryWeights[event.category]) {
        contentScore += vector.categoryWeights[event.category];
      }
      if (event.location && vector.locationWeights[event.location]) {
        contentScore += vector.locationWeights[event.location];
      }

      const collaborativeScore = collaborativeScores.get(event.id) ?? 0;
      // Blend content and collaborative signals.
      const score =
        CONTENT_WEIGHT * contentScore +
        COLLABORATIVE_WEIGHT * collaborativeScore;

      scored.push({
        eventId: event.id,
        event,
        score,
        scoreBreakdown: { contentScore, collaborativeScore },
      });
    }

    return scored;
  }

  /**
   * Collaborative filtering: given the set of events the target user attended,
   * find users who share the most co-attended events, then aggregate their
   * attendance as a normalised score for each candidate event (#1465).
   *
   * @param attendedEventIds  Events already attended by the target user.
   * @param candidates        Published events to score.
   * @returns                 Map of eventId → normalised collaborative score
   *                          in [0, 1].
   */
  private async _computeCollaborativeScores(
    attendedEventIds: Set<string>,
    candidates: Event[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (attendedEventIds.size === 0) return result;

    const attendedList = Array.from(attendedEventIds);

    // Step 1: find similar users — those who attended ≥1 of the same events.
    const similarUserRegistrations = await this.registrationsRepo
      .createQueryBuilder('reg')
      .select('reg.userId', 'userId')
      .addSelect('COUNT(*)', 'overlap')
      .where('reg.eventId IN (:...eventIds)', { eventIds: attendedList })
      .andWhere('reg.status = :status', { status: RegistrationStatus.CONFIRMED })
      .groupBy('reg.userId')
      .orderBy('overlap', 'DESC')
      .limit(MAX_SIMILAR_USERS)
      .getRawMany<{ userId: string; overlap: string }>();

    if (similarUserRegistrations.length === 0) return result;

    const similarUserIds = similarUserRegistrations.map((r) => r.userId);

    // Step 2: find which candidate events those similar users attended.
    const candidateIds = candidates.map((e) => e.id);
    if (candidateIds.length === 0) return result;

    const coAttendance = await this.registrationsRepo
      .createQueryBuilder('reg')
      .select('reg.eventId', 'eventId')
      .addSelect('COUNT(DISTINCT reg.userId)', 'userCount')
      .where('reg.userId IN (:...userIds)', { userIds: similarUserIds })
      .andWhere('reg.eventId IN (:...eventIds)', { eventIds: candidateIds })
      .andWhere('reg.status = :status', { status: RegistrationStatus.CONFIRMED })
      .groupBy('reg.eventId')
      .getRawMany<{ eventId: string; userCount: string }>();

    const maxUsers = Math.max(MAX_SIMILAR_USERS, 1);
    for (const row of coAttendance) {
      result.set(row.eventId, Math.min(1, Number(row.userCount) / maxUsers));
    }

    return result;
  }

  /**
   * 3. Rank the scored candidates descending by combined score, filter out
   *    already-attended events, and return the top `limit` as a typed response
   *    (#1465).
   *
   *    Also aliased as `rankRecommendations` to match the issue-spec naming.
   */
  async generateRecommendations(
    userId: string,
    limit = 5,
  ): Promise<RecommendationResponse> {
    const vector = await this.buildUserProfileVector(userId);
    const candidates = await this.listCandidateEvents();
    const scored = await this.computeSimilarityScores(vector, candidates);

    const recommendations: RecommendationDto[] = scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ event, score }) => ({
        eventId: event.id,
        title: event.title,
        category: event.category ?? null,
        location: event.location ?? null,
        startDate: event.startDate.toISOString(),
        ticketPrice: Number(event.ticketPrice) || 0,
        currency: event.currency,
        score: Math.min(1, score),
        reason: buildReason(event.category, event.location),
      }));

    return {
      userId,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Alias for `generateRecommendations` matching the issue spec naming
   * (`rank_recommendations`) — #1465.
   */
  async rankRecommendations(
    userId: string,
    limit = 5,
  ): Promise<RecommendationResponse> {
    return this.generateRecommendations(userId, limit);
  }

  /** Persist or refresh the user's explicit preference rows (#1243). */
  async updateUserPreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UpdateUserPreferencesResultDto> {
    if (!dto.preferences || dto.preferences.length === 0) {
      return { userId, saved: 0 };
    }

    // Prune then re-insert so stale favourites stop influencing the vector.
    await this.preferencesRepo.delete({ userId });

    const rows = dto.preferences.map((entry) => ({
      userId,
      category: entry.category ?? null,
      location: entry.location ?? null,
      weight: entry.weight ?? 0,
    }));
    await this.preferencesRepo.save(rows);

    return { userId, saved: rows.length };
  }
}

function buildReason(
  category: string | null,
  location: string | null,
): string {
  if (category && location) {
    return `Matches your ${category} interests near ${location}`;
  }
  if (category) {
    return `Similar to the ${category} events you attend`;
  }
  return `Based on events in your area`;
}
