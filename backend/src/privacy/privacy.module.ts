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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TicketEntity,
      Registration,
      Review,
      ChatMessage,
      DataDeletionRequest,
    ]),
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
