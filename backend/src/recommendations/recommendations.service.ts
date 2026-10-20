import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserPreference } from './entities/user-preference.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import {
  RecommendationDto,
  RecommendationResponse,
} from './dto/recommendation-response.dto';
import {
  UpdateUserPreferencesDto,
  UpdateUserPreferencesResultDto,
} from './dto/update-user-preferences.dto';

/**
 * Weighted profile built from a user's stored preferences. Category weights
 * are the raw sum of preference weights; location weights are scaled by 0.6 so
 * a location match contributes less than a category match (#1243).
 */
export interface UserProfileVector {
  categoryWeights: Record<string, number>;
  locationWeights: Record<string, number>;
}

/** A candidate event paired with its computed relevance score. */
export interface ScoredEvent {
  eventId: string;
  event: Event;
  score: number;
}

const LOCATION_WEIGHT_FACTOR = 0.6;

/**
 * Ranked, per-user event suggestions built from the implicit preference
 * profile (`user_preferences`) — issue #1243.
 *
 * Scoring pipeline:
 *   1. buildUserProfileVector  — collapse `user_preferences` rows into weighted
 *      category and location buckets.
 *   2. computeSimilarityScores — score every candidate event by overlap with
 *      the profile vector.
 *   3. generateRecommendations — sort candidates descending by score, slice to
 *      a limit and map to the typed response.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(UserPreference)
    private readonly preferencesRepo: Repository<UserPreference>,
    @InjectRepository(Event)
    private readonly eventsRepo: Repository<Event>,
  ) {}

  /**
   * 1. Build the user's implicit profile vector from their stored
   *    preferences. Each row contributes its `weight` to the matching category
   *    bucket and `0.6 * weight` to the matching location bucket.
   */
  async buildUserProfileVector(userId: string): Promise<UserProfileVector> {
    const prefs = await this.preferencesRepo.find({ where: { userId } });

    const categoryWeights: Record<string, number> = {};
    const locationWeights: Record<string, number> = {};

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

    return { categoryWeights, locationWeights };
  }

  /** Candidate events are the published events that can be recommended. */
  async listCandidateEvents(): Promise<Event[]> {
    return this.eventsRepo.find({ where: { status: EventStatus.PUBLISHED } });
  }

  /**
   * 2. Score every candidate event against the profile vector. A category
   *    match contributes the full category weight; a location match adds the
   *    (already scaled) location weight.
   */
  async computeSimilarityScores(
    vector: UserProfileVector,
    events: Event[],
  ): Promise<ScoredEvent[]> {
    const scored: ScoredEvent[] = [];

    for (const event of events) {
      let score = 0;

      if (event.category && vector.categoryWeights[event.category]) {
        score += vector.categoryWeights[event.category];
      }
      if (event.location && vector.locationWeights[event.location]) {
        score += vector.locationWeights[event.location];
      }

      scored.push({ eventId: event.id, event, score });
    }

    return scored;
  }

  /**
   * 3. Rank the scored candidates descending by score and return the top
   *    `limit` as a typed response.
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
