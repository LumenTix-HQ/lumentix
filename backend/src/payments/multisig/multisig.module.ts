import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MultisigService } from './multisig.service';
import { MultisigController } from './multisig.controller';
import { MultisigPayout } from './entities/multisig-payout.entity';
import { Event } from '../../events/entities/event.entity';
import { StellarModule } from '../../stellar/stellar.module';
import { AuditModule } from '../../audit/audit.module';
import { EscrowModule } from '../escrow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MultisigPayout, Event]),
    StellarModule,
    AuditModule,
    EscrowModule,
  ],
  providers: [MultisigService],
  controllers: [MultisigController],
  exports: [MultisigService],
})
export class MultisigModule {}
