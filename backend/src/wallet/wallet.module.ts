import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { UsersModule } from '../users/users.module';
import { StellarModule } from '../stellar/stellar.module';
import { User } from '../users/entities/user.entity';
import { RedisProvider } from '../common/redis/redis.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ConfigModule,
    UsersModule,
    StellarModule,
  ],
  providers: [WalletService, RedisProvider],
  controllers: [WalletController],
})
export class WalletModule {}
