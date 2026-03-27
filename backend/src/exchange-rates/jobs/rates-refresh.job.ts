import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRatesService } from '../exchange-rates.service';
import { CurrenciesService } from '../../currencies/currencies.service';
import { ExchangeRate } from '../entities/exchange-rate.entity';

@Injectable()
export class RatesRefreshJob {
  private readonly logger = new Logger(RatesRefreshJob.name);
  private readonly staleRateWarningHours: number;

  constructor(
    private readonly ratesService: ExchangeRatesService,
    private readonly currenciesService: CurrenciesService,
    private readonly config: ConfigService,
    @InjectRepository(ExchangeRate)
    private readonly ratesRepository: Repository<ExchangeRate>,
  ) {
    this.staleRateWarningHours = this.config.get<number>('STALE_RATE_WARNING_HOURS') ?? 2;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshRates() {
    const codes = await this.currenciesService.findActiveCodes();
    const pairs = codes.flatMap((from) =>
      codes.filter((to) => to !== from).map((to) => ({ from, to })),
    );

    let refreshed = 0;
    let failed = 0;
    for (const { from, to } of pairs) {
      try {
        await this.ratesService.getRate(from, to);
        refreshed++;
      } catch {
        failed++;
        this.logger.warn(`Failed to refresh rate ${from}→${to}`);
      }
    }
    this.logger.log(`Rate refresh complete: ${refreshed} refreshed, ${failed} failed`);

    await this.checkStaleRates();
  }

  private async checkStaleRates() {
    const staleThreshold = new Date(
      Date.now() - this.staleRateWarningHours * 60 * 60 * 1000,
    );

    const staleRates = await this.ratesRepository
      .createQueryBuilder('r')
      .where('r.fetchedAt < :threshold', { threshold: staleThreshold })
      .getMany();

    for (const rate of staleRates) {
      this.logger.warn(
        `Stale rate detected: ${rate.fromCode}→${rate.toCode} (last fetched ${rate.fetchedAt.toISOString()})`,
      );
    }
  }
}
