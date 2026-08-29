import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UpgradeAuctionService } from './upgrade-auction.service';
import { UpgradeAuctionController } from './upgrade-auction.controller';
import { UpgradeAuction } from './entities/upgrade-auction.entity';
import { UpgradeBid } from './entities/upgrade-bid.entity';
import { EventsModule } from '../events/events.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UpgradeAuction, UpgradeBid]),
    EventsModule,
    TicketsModule,
  ],
  controllers: [UpgradeAuctionController],
  providers: [UpgradeAuctionService],
  exports: [UpgradeAuctionService],
})
export class UpgradeAuctionModule {}
