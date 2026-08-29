import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { EventReview, ReviewStatus } from './entities/event-review.entity';
import { AuditService } from '../audit/audit.service';
import {
  INTENSIFIERS,
  NEGATORS,
  SENTIMENT_LEXICON,
  THEME_KEYWORDS,
  TOXIC_TERMS,
} from './review-sentiment.lexicon';

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface SentimentAnalysis {
  /** Normalised to [-1, 1]. */
  score: number;
  label: SentimentLabel;
  /** [0, 1] — how much sentiment-bearing signal the text actually carried. */
  confidence: number;
  /** Themes mentioned, with the polarity each was mentioned with. */
  themes: Array<{ theme: string; score: number; mentions: number }>;
  /** Sentiment-bearing terms that drove the score, strongest first. */
  drivers: Array<{ term: string; weight: number }>;
}

export interface SentimentSummary {
  eventId: string;
  reviewsAnalysed: number;
  /** Mean sentiment across every analysed review, in [-1, 1]. */
  aggregateScore: number;
  averageRating: number | null;
  distribution: Record<SentimentLabel, number>;
  commonPraise: Array<{ theme: string; mentions: number; score: number }>;
  commonComplaints: Array<{ theme: string; mentions: number; score: number }>;
  summary: string;
}

export interface ToxicityAssessment {
  reviewId: string;
  isToxic: boolean;
  /** [0, 1]. */
  severity: number;
  matchedTerms: string[];
  flagged: boolean;
  reason: string;
}

/**
 * Sentiment and moderation analysis over attendee reviews (issue #995).
 *
 * The analyser is lexicon-based rather than model-based. That is a deliberate
 * trade: it is deterministic, runs in-process with no network call or model
 * dependency, and its verdict on any given review can be explained by
 * pointing at the words that produced it — which matters when the output can
 * get somebody's review hidden. It handles negation and intensifiers, which
 * is where naive keyword counting usually goes wrong ("not great" is not
 * praise).
 */
@Injectable()
export class ReviewSentimentService {
  private readonly logger = new Logger(ReviewSentimentService.name);

  /** Above this, a review reads as praise; below its negation, as a complaint. */
  private static readonly LABEL_THRESHOLD = 0.15;
  /** Above this, a review is withheld for moderation. */
  private static readonly TOXICITY_THRESHOLD = 0.5;

  constructor(
    @InjectRepository(EventReview)
    private readonly reviewRepo: Repository<EventReview>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Score a single piece of review text.
   *
   * `rating`, when supplied, is blended in at a quarter weight. Star ratings
   * and prose disagree often enough — "loved it, 2 stars" is usually a
   * mis-click, and terse text carries little signal — that ignoring the
   * rating throws away the most reliable field on the record. Text still
   * dominates, because that is what the issue asks to analyse.
   */
  analyzeReviewSentiment(text: string | null, rating?: number): SentimentAnalysis {
    const tokens = this.tokenize(text ?? '');

    let total = 0;
    let matches = 0;
    const drivers: Array<{ term: string; weight: number }> = [];

    for (let i = 0; i < tokens.length; i++) {
      const base = SENTIMENT_LEXICON[tokens[i]];
      if (base === undefined) continue;

      // Look back two tokens for a negator or intensifier — far enough for
      // "not very good", short enough not to reach into the previous clause.
      let weight = base;
      const window = tokens.slice(Math.max(0, i - 2), i);
      const intensifier = window.find((t) => INTENSIFIERS[t] !== undefined);
      if (intensifier) weight *= INTENSIFIERS[intensifier];
      if (window.some((t) => NEGATORS.includes(t))) weight *= -1;

      total += weight;
      matches += 1;
      drivers.push({ term: tokens[i], weight: Math.round(weight * 100) / 100 });
    }

    // Average over matched terms, not over the whole text: a long review is
    // not more positive than a short one just for being long.
    let score = matches > 0 ? total / matches : 0;

    if (typeof rating === 'number' && Number.isFinite(rating)) {
      const ratingScore = (rating - 3) / 2; // 1..5 → -1..1
      score = matches > 0 ? score * 0.75 + ratingScore * 0.25 : ratingScore;
    }

    score = this.clamp(score);

    // Confidence saturates at four sentiment-bearing terms; below that the
    // verdict rests on very little.
    const confidence =
      matches === 0
        ? typeof rating === 'number'
          ? 0.4
          : 0
        : Math.min(1, 0.4 + matches * 0.15);

    return {
      score: Math.round(score * 100) / 100,
      label: this.labelFor(score),
      confidence: Math.round(confidence * 100) / 100,
      themes: this.extractThemes(tokens, drivers),
      drivers: drivers
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
        .slice(0, 5),
    };
  }

  /**
   * Aggregate sentiment for one event's live reviews and pull out what
   * attendees keep praising and keep complaining about.
   *
   * Only VERIFIED reviews count. Pending ones have unproven attendance and
   * flagged ones are under moderation; letting either shape a public summary
   * would reopen the fake-review hole the verification flow exists to close.
   */
  async generateSentimentSummary(eventId: string): Promise<SentimentSummary> {
    const reviews = await this.reviewRepo.find({
      where: { eventId, status: In([ReviewStatus.VERIFIED]) },
    });

    if (reviews.length === 0) {
      return {
        eventId,
        reviewsAnalysed: 0,
        aggregateScore: 0,
        averageRating: null,
        distribution: { positive: 0, neutral: 0, negative: 0 },
        commonPraise: [],
        commonComplaints: [],
        summary: 'No verified reviews yet.',
      };
    }

    const distribution: Record<SentimentLabel, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    const themeTotals = new Map<string, { score: number; mentions: number }>();
    let scoreTotal = 0;
    let ratingTotal = 0;

    for (const review of reviews) {
      const analysis = this.analyzeReviewSentiment(review.comment, review.rating);
      scoreTotal += analysis.score;
      ratingTotal += review.rating;
      distribution[analysis.label] += 1;

      for (const theme of analysis.themes) {
        const acc = themeTotals.get(theme.theme) ?? { score: 0, mentions: 0 };
        acc.score += theme.score * theme.mentions;
        acc.mentions += theme.mentions;
        themeTotals.set(theme.theme, acc);
      }
    }

    const themes = Array.from(themeTotals.entries()).map(([theme, acc]) => ({
      theme,
      mentions: acc.mentions,
      score: Math.round((acc.score / acc.mentions) * 100) / 100,
    }));

    const byWeight = (
      a: { mentions: number; score: number },
      b: { mentions: number; score: number },
    ) => Math.abs(b.score) * b.mentions - Math.abs(a.score) * a.mentions;

    const commonPraise = themes
      .filter((t) => t.score > ReviewSentimentService.LABEL_THRESHOLD)
      .sort(byWeight);
    const commonComplaints = themes
      .filter((t) => t.score < -ReviewSentimentService.LABEL_THRESHOLD)
      .sort(byWeight);

    const aggregateScore =
      Math.round((scoreTotal / reviews.length) * 100) / 100;

    return {
      eventId,
      reviewsAnalysed: reviews.length,
      aggregateScore,
      averageRating: Math.round((ratingTotal / reviews.length) * 100) / 100,
      distribution,
      commonPraise,
      commonComplaints,
      summary: this.describe(
        aggregateScore,
        reviews.length,
        commonPraise,
        commonComplaints,
      ),
    };
  }

  /**
   * Assess a review for abuse and, if it crosses the threshold, withhold it.
   *
   * Toxicity is scored independently of sentiment on purpose. A furious
   * one-star review is legitimate feedback and must stay visible; what gets
   * withheld is abuse aimed at a person. Flagging sets `status = FLAGGED`,
   * which takes the review out of the public summary without deleting it, so
   * a moderator can still reverse the call.
   */
  async flagToxicReview(reviewId: string): Promise<ToxicityAssessment> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const { severity, matchedTerms } = this.scoreToxicity(review.comment ?? '');
    const isToxic = severity >= ReviewSentimentService.TOXICITY_THRESHOLD;

    if (!isToxic) {
      return {
        reviewId,
        isToxic: false,
        severity,
        matchedTerms,
        flagged: false,
        reason: matchedTerms.length
          ? 'Contains harsh language but stays within acceptable criticism'
          : 'No abusive language detected',
      };
    }

    // Already flagged — report it, but do not re-log a moderation action.
    if (review.status === ReviewStatus.FLAGGED) {
      return {
        reviewId,
        isToxic: true,
        severity,
        matchedTerms,
        flagged: true,
        reason: 'Review was already flagged for moderation',
      };
    }

    review.status = ReviewStatus.FLAGGED;
    await this.reviewRepo.save(review);

    await this.auditService.log({
      action: 'REVIEW_FLAGGED_TOXIC',
      userId: review.reviewerId,
      resourceId: review.id,
      meta: { eventId: review.eventId, severity, matchedTerms },
    });

    this.logger.warn(
      `Review ${reviewId} flagged for moderation (severity=${severity})`,
    );

    return {
      reviewId,
      isToxic: true,
      severity,
      matchedTerms,
      flagged: true,
      reason: 'Flagged for moderation: abusive language directed at people',
    };
  }

  // ───────────────────────────────────────────────────────────────────────

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  private clamp(value: number): number {
    return Math.max(-1, Math.min(1, value));
  }

  private labelFor(score: number): SentimentLabel {
    if (score > ReviewSentimentService.LABEL_THRESHOLD) return 'positive';
    if (score < -ReviewSentimentService.LABEL_THRESHOLD) return 'negative';
    return 'neutral';
  }

  /**
   * Attribute sentiment to the themes a review mentions.
   *
   * Each sentiment-bearing term is credited to the *nearest* theme keyword
   * within four tokens, and to that theme only. Crediting every theme in
   * range instead lets one clause bleed into the next — in "the venue was
   * excellent but the queue was terrible" both terms sit within four tokens
   * of "queue", which would cancel out and report the queue as neutral.
   *
   * Themes mentioned with no sentiment term nearby still count as a mention,
   * at neutral, so "the parking" is not silently dropped.
   */
  private extractThemes(
    tokens: string[],
    drivers: Array<{ term: string; weight: number }>,
  ): Array<{ theme: string; score: number; mentions: number }> {
    // Every theme keyword occurrence, as (position, theme).
    const anchors: Array<{ position: number; theme: string }> = [];
    const mentions = new Map<string, number>();

    tokens.forEach((token, position) => {
      for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
        if (!keywords.includes(token)) continue;
        anchors.push({ position, theme });
        mentions.set(theme, (mentions.get(theme) ?? 0) + 1);
      }
    });

    if (anchors.length === 0) return [];

    const totals = new Map<string, { score: number; scored: number }>();

    tokens.forEach((token, index) => {
      if (SENTIMENT_LEXICON[token] === undefined) return;

      let nearest: { position: number; theme: string } | null = null;
      for (const anchor of anchors) {
        const distance = Math.abs(anchor.position - index);
        if (distance > 4) continue;
        if (
          nearest === null ||
          distance < Math.abs(nearest.position - index)
        ) {
          nearest = anchor;
        }
      }
      if (!nearest) return;

      const driver = drivers.find((d) => d.term === token);
      const weight = driver ? driver.weight : SENTIMENT_LEXICON[token];
      const acc = totals.get(nearest.theme) ?? { score: 0, scored: 0 };
      acc.score += weight;
      acc.scored += 1;
      totals.set(nearest.theme, acc);
    });

    return Array.from(mentions.entries()).map(([theme, count]) => {
      const acc = totals.get(theme);
      return {
        theme,
        score: acc ? Math.round((acc.score / acc.scored) * 100) / 100 : 0,
        mentions: count,
      };
    });
  }

  private scoreToxicity(text: string): {
    severity: number;
    matchedTerms: string[];
  } {
    const lower = text.toLowerCase();
    const tokens = this.tokenize(text);
    const matched: string[] = [];
    let peak = 0;

    for (const [term, weight] of Object.entries(TOXIC_TERMS)) {
      const hit = term.includes(' ')
        ? lower.includes(term)
        : tokens.includes(term);
      if (!hit) continue;
      matched.push(term);
      peak = Math.max(peak, weight);
    }

    // Severity tracks the worst single term, nudged up when several land —
    // one slur is worse than three mild insults, but three is not one.
    const severity =
      matched.length === 0
        ? 0
        : Math.min(1, peak + Math.min(0.2, (matched.length - 1) * 0.1));

    return {
      severity: Math.round(severity * 100) / 100,
      matchedTerms: matched,
    };
  }

  private describe(
    score: number,
    count: number,
    praise: Array<{ theme: string }>,
    complaints: Array<{ theme: string }>,
  ): string {
    const tone =
      score > 0.4
        ? 'strongly positive'
        : score > ReviewSentimentService.LABEL_THRESHOLD
          ? 'positive'
          : score < -0.4
            ? 'strongly negative'
            : score < -ReviewSentimentService.LABEL_THRESHOLD
              ? 'negative'
              : 'mixed';

    const parts = [`Sentiment across ${count} verified review${count === 1 ? '' : 's'} is ${tone}.`];
    if (praise.length > 0) {
      parts.push(`Most praised: ${praise.map((p) => p.theme).join(', ')}.`);
    }
    if (complaints.length > 0) {
      parts.push(
        `Most complained about: ${complaints.map((c) => c.theme).join(', ')}.`,
      );
    }
    return parts.join(' ');
  }
}
