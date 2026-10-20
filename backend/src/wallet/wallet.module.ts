import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { UsersModule } from '../users/users.module';
import { StellarModule } from '../stellar/stellar.module';
import { User } from '../users/entities/user.entity';
import { UserWallet } from './entities/user-wallet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserWallet]),
    ConfigModule,
    UsersModule,
    StellarModule,
  ],
  providers: [WalletService],
  controllers: [WalletController],
})
export class WalletModule {}
