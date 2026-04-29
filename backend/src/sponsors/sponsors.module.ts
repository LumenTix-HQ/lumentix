import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SponsorsService } from './sponsors.service';
import { SponsorsController } from './sponsors.controller';
import { ContributionsService } from './contributions.service';
import { SponsorTier } from './entities/sponsor-tier.entity';
import { SponsorContribution } from './entities/sponsor-contribution.entity';
import { Sponsor } from './entities/sponsor.entity';
import { EventsModule } from 'src/events/events.module';
import { StellarModule } from 'src/stellar/stellar.module';
import { AuditModule } from 'src/audit/audit.module';
import { NotificationModule } from 'src/notifications/notification.module';
import { User } from 'src/users/entities/user.entity';
import { Event } from 'src/events/entities/event.entity';
import { EscrowModule } from 'src/payments/escrow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SponsorTier, SponsorContribution, Sponsor, User, Event]),
    EventsModule,
    StellarModule,
    AuditModule,
    NotificationModule,
    EscrowModule,
  ],
  controllers: [SponsorsController],
  providers: [SponsorsService, ContributionsService],
  exports: [SponsorsService, ContributionsService],
})
export class SponsorsModule {}
