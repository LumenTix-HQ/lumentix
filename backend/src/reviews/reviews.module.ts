import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventReview } from './entities/event-review.entity';
import { OrganizerReputation } from './entities/organizer-reputation.entity';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';

import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventReview,
      OrganizerReputation,
      TicketEntity,
      Event,
    ]),
    AuditModule,
  ],
  providers: [ReviewsService],
  controllers: [ReviewsController],
  exports: [ReviewsService],
})
export class ReviewsModule {}
