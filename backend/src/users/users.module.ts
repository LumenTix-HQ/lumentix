import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { RoleRequest } from './entities/role-request.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CurrenciesModule } from '../currencies/currencies.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { StellarModule } from '../stellar/stellar.module';
import { TicketEntity } from '../tickets/entities/ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RoleRequest, TicketEntity]),
    CurrenciesModule,
    ExchangeRatesModule,
    StellarModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
