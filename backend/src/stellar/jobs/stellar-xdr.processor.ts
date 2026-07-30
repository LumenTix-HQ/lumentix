import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Job } from 'bull';
import { PersistedXdr, XdrStatus } from '../entities/persisted-xdr.entity';
import { StellarService } from '../stellar.service';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [5_000, 15_000, 60_000]; // exponential backoff steps

@Processor('stellar-xdr-replay')
export class StellarXdrReplayProcessor {
  private readonly logger = new Logger(StellarXdrReplayProcessor.name);

  constructor(
    @InjectRepository(PersistedXdr)
    private readonly xdrRepository: Repository<PersistedXdr>,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Process a single XDR replay job.
   * Re-submits the persisted XDR to Horizon.
   */
  @Process('replay')
  async handleReplay(job: Job<{ xdrId: string }>): Promise<void> {
    const { xdrId } = job.data;
    const record = await this.xdrRepository.findOne({ where: { id: xdrId } });
    if (!record) {
      this.logger.warn(`XDR record ${xdrId} not found, skipping replay`);
      return;
    }

    if (record.status === XdrStatus.CONFIRMED) {
      this.logger.debug(`XDR ${xdrId} already confirmed, skipping`);
      return;
    }

    if (record.retryCount >= MAX_RETRIES) {
      this.logger.warn(
        `XDR ${xdrId} exceeded max retries (${MAX_RETRIES}), marking as failed`,
      );
      record.status = XdrStatus.FAILED;
      record.lastError = 'Max retries exceeded';
      await this.xdrRepository.save(record);
      return;
    }

    try {
      record.status = XdrStatus.RETRYING;
      record.retryCount += 1;
      await this.xdrRepository.save(record);

      this.logger.log(
        `Replaying XDR ${xdrId} (attempt ${record.retryCount}/${MAX_RETRIES})`,
      );

      const result = await this.stellarService.submitTransaction(record.xdr);

      if (result.successful) {
        record.status = XdrStatus.CONFIRMED;
        record.transactionHash = result.hash ?? null;
        record.lastError = null;
        this.logger.log(
          `XDR ${xdrId} replayed successfully, txHash=${result.hash}`,
        );
      } else {
        const errMsg =
          result.extras?.result_codes?.transaction ?? 'Unknown error';
        record.status = XdrStatus.FAILED;
        record.lastError = errMsg;
        this.logger.warn(`XDR ${xdrId} replay failed: ${errMsg}`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      record.status = XdrStatus.FAILED;
      record.lastError = message;
      this.logger.error(`XDR ${xdrId} replay error: ${message}`);
    }

    await this.xdrRepository.save(record);
  }

  /**
   * Scheduled job: pick up all pending/broadcast XDRs that are due for retry.
   * Called by a cron or Bull repeatable job.
   */
  async processDueRetries(): Promise<void> {
    const due = await this.xdrRepository.find({
      where: [
        { status: XdrStatus.PENDING, nextRetryAt: LessThanOrEqual(new Date()) },
        { status: XdrStatus.BROADCAST, nextRetryAt: LessThanOrEqual(new Date()) },
        { status: XdrStatus.RETRYING, nextRetryAt: LessThanOrEqual(new Date()) },
      ],
      take: 50,
    });

    for (const record of due) {
      this.logger.log(`Scheduling retry for XDR ${record.id}`);
      record.status = XdrStatus.PENDING;
      await this.xdrRepository.save(record);
      // The Bull queue will pick this up on next poll
    }
  }
}
