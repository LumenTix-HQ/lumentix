import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Registration } from '../registrations/entities/registration.entity';
import { Review } from '../reviews/entities/review.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { DataDeletionRequest } from './entities/data-deletion-request.entity';
import { LoyaltyAccount } from '../loyalty/entities/loyalty-account.entity';
import { LoyaltyTransaction } from '../loyalty/entities/loyalty-transaction.entity';
import { LoyaltyDiscount } from '../loyalty/entities/loyalty-discount.entity';
import { InsurancePolicy } from '../insurance/entities/insurance-policy.entity';
import { InsuranceClaim } from '../insurance/entities/insurance-claim.entity';
import { UserAchievement } from '../gamification/entities/user-achievement.entity';
import { UserBadge } from '../gamification/entities/user-badge.entity';
import { SocialProfile } from '../social/entities/social-profile.entity';
import { AttendeeConnection } from '../social/entities/attendee-connection.entity';
import { Payment } from '../payments/entities/payment.entity';

/**
 * Issue #1134: Comprehensive GDPR data export
 * Includes all user-linked personal data from every module
 */
export interface UserDataExport {
  exportedAt: string;
  profile: Omit<User, 'passwordHash'>;
  // Event & Registration data
  tickets: TicketEntity[];
  registrations: Registration[];
  // Content data
  reviews: Review[];
  chatMessages: ChatMessage[];
  // Loyalty program
  loyaltyAccount: LoyaltyAccount | null;
  loyaltyTransactions: LoyaltyTransaction[];
  loyaltyDiscounts: LoyaltyDiscount[];
  // Insurance
  insurancePolicies: InsurancePolicy[];
  insuranceClaims: InsuranceClaim[];
  // Gamification
  achievements: UserAchievement[];
  badges: UserBadge[];
  // Social
  socialProfile: SocialProfile | null;
  connections: AttendeeConnection[];
  // Financial
  payments: Payment[];
  // Metadata
  coverageNote: string;
}

export interface AnonymizationResult {
  userId: string;
  anonymizedAt: string;
  recordsAnonymized: {
    reviews: number;
    chatMessages: number;
    loyaltyTransactions: number;
    achievements: number;
    socialProfile: number;
    connections: number;
  };
}

@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TicketEntity)
    private readonly ticketsRepository: Repository<TicketEntity>,
    @InjectRepository(Registration)
    private readonly registrationsRepository: Repository<Registration>,
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(LoyaltyAccount)
    private readonly loyaltyAccountRepository: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyTransaction)
    private readonly loyaltyTransactionRepository: Repository<LoyaltyTransaction>,
    @InjectRepository(LoyaltyDiscount)
    private readonly loyaltyDiscountRepository: Repository<LoyaltyDiscount>,
    @InjectRepository(InsurancePolicy)
    private readonly insurancePolicyRepository: Repository<InsurancePolicy>,
    @InjectRepository(InsuranceClaim)
    private readonly insuranceClaimRepository: Repository<InsuranceClaim>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(UserBadge)
    private readonly userBadgeRepository: Repository<UserBadge>,
    @InjectRepository(SocialProfile)
    private readonly socialProfileRepository: Repository<SocialProfile>,
    @InjectRepository(AttendeeConnection)
    private readonly attendeeConnectionRepository: Repository<AttendeeConnection>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(DataDeletionRequest)
    private readonly deletionRequestRepository: Repository<DataDeletionRequest>,
  ) {}

  /**
   * Issue #1134: Comprehensive GDPR data export including all user-linked personal data
   * Covers Article 15 (right of access) requirements
   */
  async exportUserData(userId: string): Promise<UserDataExport> {
    const user = await this.getUserOrThrow(userId);

    const [
      tickets,
      registrations,
      reviews,
      chatMessages,
      loyaltyAccount,
      loyaltyTransactions,
      loyaltyDiscounts,
      insurancePolicies,
      insuranceClaims,
      userAchievements,
      userBadges,
      socialProfile,
      connections,
      payments,
    ] = await Promise.all([
      this.ticketsRepository.find({ where: { ownerId: userId } }),
      this.registrationsRepository.find({ where: { userId } }),
      this.reviewsRepository.find({ where: { authorId: userId } }),
      this.chatMessageRepository.find({ where: { userId } }),
      this.loyaltyAccountRepository.findOne({ where: { userId } }),
      this.loyaltyTransactionRepository.find({ where: { userId } }),
      this.loyaltyDiscountRepository.find({ where: { userId } }),
      this.insurancePolicyRepository.find({ where: { userId } }),
      this.insuranceClaimRepository.find({ where: { claimantUserId: userId } }),
      this.userAchievementRepository.find({ where: { userId } }),
      this.userBadgeRepository.find({ where: { userId } }),
      this.socialProfileRepository.findOne({ where: { userId } }),
      this.attendeeConnectionRepository.find({
        where: [
          { requesterId: userId },
          { recipientId: userId },
        ],
      }),
      this.paymentRepository.find({ where: { userId } }),
    ]);

    const { passwordHash, ...profile } = user;

    return {
      exportedAt: new Date().toISOString(),
      profile,
      tickets,
      registrations,
      reviews,
      chatMessages,
      loyaltyAccount,
      loyaltyTransactions,
      loyaltyDiscounts,
      insurancePolicies,
      insuranceClaims,
      achievements: userAchievements,
      badges: userBadges,
      socialProfile,
      connections,
      payments,
      coverageNote: 'Complete GDPR Article 15 export including all user-linked personal data across loyalty, insurance, gamification, social, and financial modules.',
    };
  }

  async requestDataDeletion(
    userId: string,
    requesterId: string,
  ): Promise<DataDeletionRequest> {
    if (requesterId !== userId) {
      throw new ForbiddenException('You can only request deletion of your own data');
    }

    const user = await this.getUserOrThrow(userId);
    if (user.deletedAt) {
      throw new BadRequestException('A deletion request has already been made for this account');
    }

    const request = this.deletionRequestRepository.create({ userId, status: 'pending' });
    const saved = await this.deletionRequestRepository.save(request);

    user.deletedAt = new Date();
    await this.usersRepository.save(user);

    return saved;
  }

  /**
   * Issue #1134: Enhanced anonymization covering all modules
   */
  async anonymizeHistoricalRecords(
    userId: string,
    requesterId: string,
  ): Promise<AnonymizationResult> {
    if (requesterId !== userId) {
      throw new ForbiddenException('You can only anonymize your own data');
    }

    const deletionRequest = await this.deletionRequestRepository.findOne({
      where: { userId, status: 'pending' },
      order: { requestedAt: 'DESC' },
    });
    if (!deletionRequest) {
      throw new BadRequestException(
        'No pending deletion request found; call requestDataDeletion first',
      );
    }

    const user = await this.getUserOrThrow(userId);

    // Anonymize records across all modules
    const reviewsResult = await this.reviewsRepository.update(
      { authorId: userId },
      { body: null },
    );
    const chatResult = await this.chatMessageRepository.update(
      { userId },
      { message: '[deleted]', username: 'Deleted User' },
    );
    const loyaltyTxResult = await this.loyaltyTransactionRepository.update(
      { userId },
      { description: '[deleted]' },
    );
    const achievementResult = await this.userAchievementRepository.update(
      { userId },
      { context: null },
    );

    // Update social profile
    let socialUpdateCount = 0;
    const socialProfile = await this.socialProfileRepository.findOne({ where: { userId } });
    if (socialProfile) {
      socialProfile.displayName = 'Deleted User';
      socialProfile.bio = null;
      socialProfile.title = null;
      socialProfile.socialLinks = null;
      socialProfile.interests = null;
      await this.socialProfileRepository.save(socialProfile);
      socialUpdateCount = 1;
    }

    // Delete or anonymize connections
    const connectionsResult = await this.attendeeConnectionRepository.delete({
      requesterId: userId,
    });
    await this.attendeeConnectionRepository.delete({
      recipientId: userId,
    });

    // Anonymize user profile
    user.email = `deleted-${randomUUID()}@anonymized.local`;
    user.googleId = null;
    user.stellarPublicKey = null;
    user.emailVerificationToken = null;
    await this.usersRepository.save(user);

    deletionRequest.status = 'completed';
    deletionRequest.completedAt = new Date();
    await this.deletionRequestRepository.save(deletionRequest);

    return {
      userId,
      anonymizedAt: deletionRequest.completedAt.toISOString(),
      recordsAnonymized: {
        reviews: reviewsResult.affected ?? 0,
        chatMessages: chatResult.affected ?? 0,
        loyaltyTransactions: loyaltyTxResult.affected ?? 0,
        achievements: achievementResult.affected ?? 0,
        socialProfile: socialUpdateCount,
        connections: (connectionsResult.affected ?? 0) + ((await this.attendeeConnectionRepository.count({ where: { recipientId: userId } })) || 0),
      },
    };
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User "${userId}" not found`);
    return user;
  }
}
