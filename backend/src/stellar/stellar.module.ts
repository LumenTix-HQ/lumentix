import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { stellarConfig } from './stellar.config';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ConfigModule.forFeature(stellarConfig), UsersModule],
  controllers: [StellarController],
  providers: [StellarService],
  exports: [StellarService],
})
export class StellarModule {}
