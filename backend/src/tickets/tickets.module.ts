import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TicketEntity } from './entities/ticket.entity';
import { TicketSigningService } from './ticket-signing.service';
import { TicketPdfService } from './ticket-pdf.service';
import { Event } from '../events/entities/event.entity';
import { EventSeries } from '../events/entities/event-series.entity';
import { User } from '../users/entities/user.entity';
import { TicketsService } from './tickets.service';
import { TicketsController, TicketsPublicController } from './tickets.controller';
import { PaymentsModule } from '../payments/payments.module';
import { StellarModule } from '../stellar/stellar.module';
import { NotificationModule } from '../notifications/notification.module';
import { VerificationController } from './verification/verification.controller';
import { TicketExpiryJob } from './jobs/ticket-expiry.job';
import { AuditModule } from '../audit/audit.module';
import { ResaleService } from './resale/resale.service';
import { ResaleController } from './resale/resale.controller';
import { ResaleMarketplaceController } from './resale/resale-marketplace.controller';
import { RedisModule } from '../redis/redis.module';
import { ResaleTransaction } from './resale/resale-transaction.entity';
import { DynamicQrService } from './dynamic-qr/dynamic-qr.service';
import { DynamicQrController } from './dynamic-qr/dynamic-qr.controller';
import { TicketGift } from './gifting/ticket-gift.entity';
import { GiftingService } from './gifting/gifting.service';
import { GiftingController } from './gifting/gifting.controller';
import { GiftDeliveryJob } from './gifting/gift-delivery.job';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TicketEntity, Event, EventSeries, User, ResaleTransaction, TicketGift]),
    forwardRef(() => PaymentsModule),
    StellarModule,
    NotificationModule,
    AuditModule,
    // #861: provides CACHE_MANAGER for the marketplace listing cache.
    RedisModule,
  ],
  providers: [TicketsService, TicketSigningService, TicketPdfService, TicketExpiryJob, ResaleService, DynamicQrService, GiftingService, GiftDeliveryJob],
  controllers: [TicketsController, TicketsPublicController, VerificationController, ResaleController, ResaleMarketplaceController, DynamicQrController, GiftingController],
  exports: [TicketsService, ResaleService, GiftingService],
})
export class TicketsModule {}
