import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Registration, RegistrationStatus } from '../entities/registration.entity';
import { RegistrationsService } from '../registrations.service';

const HOLD_MINUTES = Number(process.env.WAITLIST_HOLD_MINUTES ?? 60);

@Injectable()
export class WaitlistExpiryJob {
  private readonly logger = new Logger(WaitlistExpiryJob.name);

  constructor(
    @InjectRepository(Registration)
    private readonly repo: Repository<Registration>,
    private readonly registrationsService: RegistrationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStalePromotions(): Promise<void> {
    const cutoff = new Date(Date.now() - HOLD_MINUTES * 60 * 1000);

    const stale = await this.repo.find({
      where: {
        status: RegistrationStatus.PENDING,
        updatedAt: LessThan(cutoff),
      },
    });

    for (const reg of stale) {
      try {
        reg.status = RegistrationStatus.WAITLISTED;
        await this.repo.save(reg);
        this.logger.log(
          `Waitlist hold expired for registration ${reg.id} (event ${reg.eventId})`,
        );
        await this.registrationsService.promoteFromWaitlist(reg.eventId);
      } catch (err) {
        this.logger.error(
          `Failed to expire waitlist hold for registration ${reg.id}`,
          err,
        );
      }
    }
  }
}
