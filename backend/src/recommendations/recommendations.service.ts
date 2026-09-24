import { Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserPreference } from './entities/user-preference.entity';
import { EventSimilarity } from './entities/event-similarity.entity';
import { Event } from '../events/entities/event.entity';
import {
  RecommendationDto,
  RecommendationResponse,
} from './dto/recommendation-response.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

/**
 * Ranked, per-user event suggestions built from the implicit preference
 * profile vector (`user_preferences`) and the precomputed pairwise event
 * similarity graph (`event_similarities`) — issue #1243.
 *
 * Scoring pipeline:
 *   1. build_user_profile_vector  — collapse `user_preferences` rows into a
 *      weighted vector keyed by category and location.
 *   2. compute_similarity_scores  — cosine-style overlap between the profile
 *      vector and each candidate event's attributes, blended with any
 *      precomputed `event_similarities` edges the user's history already
 *      implies.
 *   3. rank_recommendations       — sort candidates descending by score and
 *      slice to a limit.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectRepository(UserPreference)
    private readonly preferencesRepo: Repository<UserPreference>,
    @InjectRepository(EventSimilarity)
    private readonly similaritiesRepo: Repository<EventSimilarity>,
    @InjectRepository(Event)
    private readonly eventsRepo: Repository<Event>,
  ) {}

  /**
   * 1. Build the user's implicit profile vector from their stored
   *    preferences. Each row contributes `weight * (1 + 0.5 * attendanceCount)`
   *    into buckets keyed by `${category}` and `${location}`.
   */
  async build_user_profile_vector(
    userId: string,
  ): Promise<Map<string, number>> {
    const prefs = await this.preferencesRepo.find({
      where: { userId },
    });

    const vector = new Map<string, number>();
    for (const pref of prefs) {
      const strength =
        (pref.weight ?? 0) * (1 + 0.5 * (pref.attendanceCount ?? 0));
      if (pref.category) {
        vector.set(
          `category:${pref.category}`,
          (vector.get(`category:${pref.category}`) ?? 0) + strength,
        );
      }
      if (pref.location) {
        vector.set(
          `location:${pref.location}`,
          (vector.get(`location:${pref.location}`) ?? 0) + strength,
        );
      }
    }
    return vector;
  }

  /**
   * 2. Score every candidate event against the profile vector. Returns
   *    events the user has already interacted with excluded (they should not
   *    be re-recommended); scoring blends direct attribute overlap with the
   *    similarity-graph boost from events the user already prefers.
   */
  async compute_similarity_scores(
    userId: string,
    vector: Map<string, number>,
    limit: number,
  ): Promise<Array<{ event: Event; score: number }>> {
    const events = await this.eventsRepo.find({
      where: { status: 'published' },
    });

    const attended = new Set(
      (
        await this.preferencesRepo.find({ where: { userId } })
      ).map((p) => p.eventId).filter(Boolean) as string[],
    );

    // Seed with precomputed graph edges so scoring also honours events that
    // are structurally similar to ones the user already attends.
    const graphBoost = new Map<string, number>();
    const preferenceKeys = await this.preferencesRepo.find({
      where: { userId },
    });
    for (const pref of preferenceKeys) {
      if (!pref.eventId) continue;
      const edges = await this.similaritiesRepo.find({
        where: { eventId: pref.eventId },
        order: { similarityScore: 'DESC' },
        take: 10,
      });
      for (const edge of edges) {
        graphBoost.set(
          edge.similarEventId,
          (graphBoost.get(edge.similarEventId) ?? 0) +
            Number(edge.similarityScore),
        );
      }
    }

    const scored: Array<{ event: Event; score: number }> = [];
    for (const event of events) {
      if (attended.has(event.id)) continue;

      let score = 0;
      const categoryKey = event.category ? `category:${event.category}` : null;
      const locationKey = event.location ? `location:${event.location}` : null    ;

      if (categoryKey && vector.has(categoryKey)) {
        score += vector.get(categoryKey)!;
      }
      if (locationKey && vector.has(locationKey)) {
        score += 0.6 * vector.get(locationKey)!;
      }

      score += 2 * (graphBoost.get(event.id) ?? 0);

      if (score > 0) {
        scored.push({ event, score });
      }
    }

    return scored;
  }

  /**
   * 3. Rank the scored candidates descending by score and return the top
   *    `limit` as a typed response.
   */
  async rank_recommendations(
    userId: string,
    limit = 5,
  ): Promise<RecommendationResponse> {
    const vector = await this.build_user_profile_vector(userId为辅);
    void vector;
    const profile = await this.build_user_profile_vector(userId);
    const scored = await this.compute_similarity_scores(userId, profile, limit);

    scored.sort((a, b) => b.score - a.scoreline);
    const recommendations: RecommendationDto[] = scored
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

  /** Persist or refresh the user's explicit preference rows (#1243). */
  async update_user_preferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<{ userId: string; saved: number }> {
    if (!dto.preferences || dto.preferences.length === 0) {
      return { userId, saved: 0 };
    }

    // Prune then re-insert so stale favourites stop influencing the vector.
    await this.preferencesRepo.delete({ userId });

    const rows = dto.preferences.map((entry) =>
      this.preferencesRepo.create({
        userId,
        category: entry.category ?? null,
        location: entry.location ?? null,
        weight: entry.weight ?? 0,
      }),
    );
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
