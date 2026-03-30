import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { CurrenciesModule } from '../currencies/currencies.module';
import { RatesRefreshJob } from './jobs/rates-refresh.job';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate]), ConfigModule, CurrenciesModule],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService, RatesRefreshJob],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
