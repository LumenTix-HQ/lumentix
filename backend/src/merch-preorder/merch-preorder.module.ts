import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchPreorderService } from './merch-preorder.service';
import { MerchPreorderController } from './merch-preorder.controller';
import { MerchVariant } from './entities/merch-variant.entity';
import { MerchPreorder } from './entities/merch-preorder.entity';
import { MerchModule } from '../merch/merch.module';
import { TicketsModule } from '../tickets/tickets.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchVariant, MerchPreorder]),
    MerchModule,
    TicketsModule,
    EventsModule,
  ],
  controllers: [MerchPreorderController],
  providers: [MerchPreorderService],
  exports: [MerchPreorderService],
})
export class MerchPreorderModule {}
