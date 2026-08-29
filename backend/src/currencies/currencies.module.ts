import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesSeeder } from './currencies.seeder';
import { CurrencyRateService } from './services/currency-rate.service';
import { FxProviderService } from './services/fx-provider.service';
import { Payment } from '../payments/entities/payment.entity';
import { CheckoutCurrencyService } from './checkout-currency.service';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Currency, Payment]),
    forwardRef(() => ExchangeRatesModule),
  ],
  controllers: [CurrenciesController],
  providers: [
    CurrenciesService,
    CurrencyRateService,
    FxProviderService,
    CheckoutCurrencyService,
  ],
  exports: [CurrenciesService, CheckoutCurrencyService],
})
export class CurrenciesModule {}
