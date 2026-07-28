import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { GamificationProfile } from './entities/user-profile.entity';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { Challenge } from './entities/challenge.entity';
import { ChallengeParticipation } from './entities/challenge-participation.entity';

import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { GamificationSeeder } from './gamification.seeder';

import { AuditModule } from '../audit/audit.module';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Achievement,
      UserAchievement,
      GamificationProfile,
      LeaderboardEntry,
      Challenge,
      ChallengeParticipation,
      User,
    ]),
    AuditModule,
  ],
  providers: [GamificationService, GamificationSeeder],
  controllers: [GamificationController],
  exports: [GamificationService],
})
export class GamificationModule {}
