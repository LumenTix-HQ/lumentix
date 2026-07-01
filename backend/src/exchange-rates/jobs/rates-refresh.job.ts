import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRatesService } from '../exchange-rates.service';
import { CurrenciesService } from '../../currencies/currencies.service';
import { ExchangeRate } from '../entities/exchange-rate.entity';
import { MailerService } from '../../mailer/mailer.service';

@Injectable()
export class RatesRefreshJob {
  private readonly logger = new Logger(RatesRefreshJob.name);
  private readonly staleRateWarningHours: number;
  private readonly adminEmail: string;

  constructor(
    private readonly ratesService: ExchangeRatesService,
    private readonly currenciesService: CurrenciesService,
    private readonly config: ConfigService,
    private readonly mailerService: MailerService,
    @InjectRepository(ExchangeRate)
    private readonly ratesRepository: Repository<ExchangeRate>,
  ) {
    this.staleRateWarningHours = this.config.get<number>('STALE_RATE_WARNING_HOURS') ?? 2;
    this.adminEmail = this.config.get<string>('ADMIN_EMAIL') ?? '';
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

    if (staleRates.length === 0) return;

    const staleList = staleRates
      .map((r) => `${r.fromCode}→${r.toCode} (last fetched ${r.fetchedAt.toISOString()})`)
      .join('\n');

    for (const rate of staleRates) {
      this.logger.warn(
        `Stale rate detected: ${rate.fromCode}→${rate.toCode} (last fetched ${rate.fetchedAt.toISOString()})`,
      );
    }

    if (this.adminEmail) {
      try {
        await this.mailerService.send(
          this.adminEmail,
          `[LumenTix] ${staleRates.length} stale exchange rate(s) detected`,
          `<p><strong>${staleRates.length} exchange rate(s) have not been refreshed in over ${this.staleRateWarningHours} hour(s):</strong></p>
           <pre>${staleList}</pre>
           <p>Check the exchange rate service and external provider connectivity.</p>`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to send stale rate alert email: ${msg}`);
      }
    } else {
      this.logger.warn('ADMIN_EMAIL not set — skipping stale rate alert email');
    }
  }
}
