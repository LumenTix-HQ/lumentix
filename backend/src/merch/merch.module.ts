import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchService } from './merch.service';
import { MerchController } from './merch.controller';
import { MerchItem } from './entities/merch-item.entity';
import { MerchReservation } from './entities/merch-reservation.entity';
import { EventsModule } from '../events/events.module';
import { TicketsModule } from '../tickets/tickets.module';
import { VipModule } from '../vip/vip.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchItem, MerchReservation]),
    EventsModule,
    TicketsModule,
    VipModule,
  ],
  controllers: [MerchController],
  providers: [MerchService],
  exports: [MerchService],
})
export class MerchModule {}
