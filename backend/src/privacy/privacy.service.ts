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

export interface UserDataExport {
  exportedAt: string;
  profile: Omit<User, 'passwordHash'>;
  tickets: TicketEntity[];
  registrations: Registration[];
  reviews: Review[];
  chatMessages: ChatMessage[];
}

export interface AnonymizationResult {
  userId: string;
  anonymizedAt: string;
  recordsAnonymized: {
    reviews: number;
    chatMessages: number;
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
    @InjectRepository(DataDeletionRequest)
    private readonly deletionRequestRepository: Repository<DataDeletionRequest>,
  ) {}

  async exportUserData(userId: string): Promise<UserDataExport> {
    const user = await this.getUserOrThrow(userId);

    const [tickets, registrations, reviews, chatMessages] = await Promise.all([
      this.ticketsRepository.find({ where: { ownerId: userId } }),
      this.registrationsRepository.find({ where: { userId } }),
      this.reviewsRepository.find({ where: { authorId: userId } }),
      this.chatMessageRepository.find({ where: { userId } }),
    ]);

    const { passwordHash, ...profile } = user;

    return {
      exportedAt: new Date().toISOString(),
      profile,
      tickets,
      registrations,
      reviews,
      chatMessages,
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

    const reviewsResult = await this.reviewsRepository.update(
      { authorId: userId },
      { body: null },
    );
    const chatResult = await this.chatMessageRepository.update(
      { userId },
      { message: '[deleted]', username: 'Deleted User' },
    );

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
      },
    };
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User "${userId}" not found`);
    return user;
  }
}
