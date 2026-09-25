import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Registration } from '../registrations/entities/registration.entity';
import { Review } from '../reviews/entities/review.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { DataDeletionRequest } from './entities/data-deletion-request.entity';
import { LoyaltyAccount } from '../loyalty/entities/loyalty-account.entity';
import { LoyaltyTransaction } from '../loyalty/entities/loyalty-transaction.entity';
import { LoyaltyDiscount } from '../loyalty/entities/loyalty-discount.entity';
import { InsurancePolicyEntity } from '../insurance/entities/insurance-policy.entity';
import { InsuranceClaim } from '../insurance/entities/insurance-claim.entity';
import { UserAchievement } from '../gamification/entities/user-achievement.entity';
import { UserBadge } from '../gamification/entities/user-badge.entity';
import { SocialProfile } from '../social/entities/social-profile.entity';
import { AttendeeConnection } from '../social/entities/attendee-connection.entity';
import { Payment } from '../payments/entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TicketEntity,
      Registration,
      Review,
      ChatMessage,
      DataDeletionRequest,
      LoyaltyAccount,
      LoyaltyTransaction,
      LoyaltyDiscount,
      InsurancePolicyEntity,
      InsuranceClaim,
      UserAchievement,
      UserBadge,
      SocialProfile,
      AttendeeConnection,
      Payment,
    ]),
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
