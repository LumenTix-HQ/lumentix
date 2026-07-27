import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { stellarConfig } from './stellar.config';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { UsersModule } from '../users/users.module';
import { PersistedXdr } from './entities/persisted-xdr.entity';
import { StellarXdrReplayProcessor } from './jobs/stellar-xdr.processor';

@Module({
  imports: [
    ConfigModule.forFeature(stellarConfig),
    TypeOrmModule.forFeature([PersistedXdr]),
    BullModule.registerQueue({ name: 'stellar-xdr-replay' }),
    UsersModule,
  ],
  controllers: [StellarController],
  providers: [StellarService, StellarXdrReplayProcessor],
  exports: [StellarService],
})
export class StellarModule {}
