import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesSeeder } from './currencies.seeder';
import { CurrencyRateService } from './services/currency-rate.service';
import { FxProviderService } from './services/fx-provider.service';
import { Payment } from '../payments/entities/payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Currency, Payment])],
  controllers: [CurrenciesController],
providers: [
  CurrenciesService,
  CurrencyRateService
  FxProviderService,
],  exports: [CurrenciesService],
})
export class CurrenciesModule {}
