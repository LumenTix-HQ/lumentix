import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement, AchievementCategory, AchievementTier } from './entities/achievement.entity';

interface AchievementSeed {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  xpReward: number;
  threshold: number;
  repeatable?: boolean;
}

const SEEDS: AchievementSeed[] = [
  // ── Booking ──────────────────────────────────────────────────────────────
  { key: 'first_ticket',        name: 'First Ticket',         description: 'Purchase your very first ticket.',                    icon: '🎟️',  category: AchievementCategory.BOOKING,   tier: AchievementTier.BRONZE,   xpReward: 50,  threshold: 1  },
  { key: 'booking_bronze',      name: 'Ticket Collector',     description: 'Purchase 5 tickets.',                                 icon: '🎫',  category: AchievementCategory.BOOKING,   tier: AchievementTier.BRONZE,   xpReward: 30,  threshold: 5  },
  { key: 'booking_silver',      name: 'Event Enthusiast',     description: 'Purchase 20 tickets.',                                icon: '🎫',  category: AchievementCategory.BOOKING,   tier: AchievementTier.SILVER,   xpReward: 75,  threshold: 20 },
  { key: 'booking_gold',        name: 'Ticket Hoarder',       description: 'Purchase 50 tickets.',                                icon: '🎫',  category: AchievementCategory.BOOKING,   tier: AchievementTier.GOLD,     xpReward: 150, threshold: 50 },
  { key: 'early_bird_bronze',   name: 'Early Bird',           description: 'Book a ticket more than 30 days before an event.',   icon: '🐦',  category: AchievementCategory.BOOKING,   tier: AchievementTier.BRONZE,   xpReward: 25,  threshold: 1  },
  { key: 'early_bird_gold',     name: 'Early Bird Gold',      description: 'Book early for 10 events.',                          icon: '🦅',  category: AchievementCategory.BOOKING,   tier: AchievementTier.GOLD,     xpReward: 100, threshold: 10 },

  // ── Loyalty ───────────────────────────────────────────────────────────────
  { key: 'attended_bronze',     name: 'Show Up',              description: 'Attend your first event.',                            icon: '👟',  category: AchievementCategory.LOYALTY,   tier: AchievementTier.BRONZE,   xpReward: 20,  threshold: 1  },
  { key: 'attended_silver',     name: 'Regular',              description: 'Attend 10 events.',                                   icon: '🏃',  category: AchievementCategory.LOYALTY,   tier: AchievementTier.SILVER,   xpReward: 80,  threshold: 10 },
  { key: 'attended_gold',       name: 'Veteran Attendee',     description: 'Attend 50 events.',                                   icon: '🏆',  category: AchievementCategory.LOYALTY,   tier: AchievementTier.GOLD,     xpReward: 200, threshold: 50 },
  { key: 'attended_platinum',   name: 'Legend',               description: 'Attend 100 events.',                                  icon: '💎',  category: AchievementCategory.LOYALTY,   tier: AchievementTier.PLATINUM, xpReward: 500, threshold: 100 },

  // ── Review ────────────────────────────────────────────────────────────────
  { key: 'first_review',        name: 'Critic',               description: 'Write your first verified event review.',             icon: '✍️',  category: AchievementCategory.REVIEW,    tier: AchievementTier.BRONZE,   xpReward: 15,  threshold: 1  },
  { key: 'review_silver',       name: 'Prolific Reviewer',    description: 'Write 10 verified reviews.',                          icon: '📝',  category: AchievementCategory.REVIEW,    tier: AchievementTier.SILVER,   xpReward: 60,  threshold: 10 },
  { key: 'review_gold',         name: 'Top Critic',           description: 'Write 25 verified reviews.',                          icon: '🌟',  category: AchievementCategory.REVIEW,    tier: AchievementTier.GOLD,     xpReward: 120, threshold: 25 },
  { key: 'five_star_reviewer',  name: 'Five Star Fan',        description: 'Give a 5-star review.',                               icon: '⭐',  category: AchievementCategory.REVIEW,    tier: AchievementTier.BRONZE,   xpReward: 10,  threshold: 1  },

  // ── Social ────────────────────────────────────────────────────────────────
  { key: 'first_share',         name: 'Spread the Word',      description: 'Share an event for the first time.',                  icon: '📣',  category: AchievementCategory.SOCIAL,    tier: AchievementTier.BRONZE,   xpReward: 5,   threshold: 1  },
  { key: 'social_silver',       name: 'Influencer',           description: 'Share 10 events.',                                    icon: '📢',  category: AchievementCategory.SOCIAL,    tier: AchievementTier.SILVER,   xpReward: 40,  threshold: 10 },
  { key: 'social_gold',         name: 'Mega Influencer',      description: 'Share 50 events.',                                    icon: '🔊',  category: AchievementCategory.SOCIAL,    tier: AchievementTier.GOLD,     xpReward: 100, threshold: 50 },

  // ── Organizer ─────────────────────────────────────────────────────────────
  { key: 'first_event_hosted',  name: 'Event Maker',          description: 'Host your first event.',                              icon: '🎪',  category: AchievementCategory.ORGANIZER, tier: AchievementTier.BRONZE,   xpReward: 30,  threshold: 1  },
  { key: 'organizer_silver',    name: 'Seasoned Organizer',   description: 'Host 5 events.',                                      icon: '🎭',  category: AchievementCategory.ORGANIZER, tier: AchievementTier.SILVER,   xpReward: 100, threshold: 5  },
  { key: 'organizer_gold',      name: 'Event Empire',         description: 'Host 20 events.',                                     icon: '👑',  category: AchievementCategory.ORGANIZER, tier: AchievementTier.GOLD,     xpReward: 300, threshold: 20 },

  // ── Explorer ──────────────────────────────────────────────────────────────
  { key: 'explorer_bronze',     name: 'Curious',              description: 'Attend events in 3 different categories.',            icon: '🗺️',  category: AchievementCategory.EXPLORER,  tier: AchievementTier.BRONZE,   xpReward: 30,  threshold: 3  },
  { key: 'explorer_silver',     name: 'Adventurer',           description: 'Attend events in 5 different categories.',            icon: '🧭',  category: AchievementCategory.EXPLORER,  tier: AchievementTier.SILVER,   xpReward: 75,  threshold: 5  },
  { key: 'explorer_gold',       name: 'World Traveller',      description: 'Attend events in all 7 categories.',                  icon: '🌍',  category: AchievementCategory.EXPLORER,  tier: AchievementTier.GOLD,     xpReward: 200, threshold: 7  },

  // ── Milestone (XP thresholds) ─────────────────────────────────────────────
  { key: 'xp_100',              name: 'Getting Started',      description: 'Reach 100 XP.',                                       icon: '🌱',  category: AchievementCategory.MILESTONE, tier: AchievementTier.BRONZE,   xpReward: 10,  threshold: 100   },
  { key: 'xp_500',              name: 'Rising Star',          description: 'Reach 500 XP.',                                       icon: '⚡',  category: AchievementCategory.MILESTONE, tier: AchievementTier.SILVER,   xpReward: 25,  threshold: 500   },
  { key: 'xp_1000',             name: 'Power User',           description: 'Reach 1,000 XP.',                                     icon: '🔥',  category: AchievementCategory.MILESTONE, tier: AchievementTier.GOLD,     xpReward: 50,  threshold: 1000  },
  { key: 'xp_5000',             name: 'Elite',                description: 'Reach 5,000 XP.',                                     icon: '💫',  category: AchievementCategory.MILESTONE, tier: AchievementTier.PLATINUM, xpReward: 200, threshold: 5000  },
];

@Injectable()
export class GamificationSeeder implements OnModuleInit {
  private readonly logger = new Logger(GamificationSeeder.name);

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepo: Repository<Achievement>,
  ) {}

  async onModuleInit(): Promise<void> {
    let seeded = 0;
    for (const seed of SEEDS) {
      const exists = await this.achievementRepo.findOne({ where: { key: seed.key } });
      if (!exists) {
        await this.achievementRepo.save(this.achievementRepo.create(seed));
        seeded++;
      }
    }
    if (seeded > 0) {
      this.logger.log(`Gamification seeder: inserted ${seeded} achievement(s).`);
    }
  }
}
