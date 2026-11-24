import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BridgeTransfer } from './entities/bridge-transfer.entity';
import { BridgeService } from './bridge.service';
import { BridgeController } from './bridge.controller';
import { TicketEntity } from '../tickets/entities/ticket.entity';

/**
 * Cross-chain bridge for ticket NFT portability (#1463).
 *
 * Exposes the three-step bridge pipeline:
 *   POST /bridge/transfers             → initiate_bridge_transfer
 *   POST /bridge/transfers/:id/lock    → lock_source_token
 *   POST /bridge/transfers/:id/mint    → mint_bridged_token
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BridgeTransfer, TicketEntity]),
  ],
  providers: [BridgeService],
  controllers: [BridgeController],
  exports: [BridgeService],
})
export class BridgeModule {}
