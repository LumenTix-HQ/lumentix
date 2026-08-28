import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Registration } from '../registrations/entities/registration.entity';
import { AgeVerification } from '../age-verification/entities/age-verification.entity';
import { User } from '../users/entities/user.entity';
import { MerchItem } from '../merch/entities/merch-item.entity';
import { MerchReservation } from '../merch/entities/merch-reservation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      TicketEntity,
      Payment,
      Registration,
      AgeVerification,
      User,
      MerchItem,
      MerchReservation,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
