import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { EmailCampaign } from './entities/email-campaign.entity';
import { EmailCampaignAnalytics } from './entities/email-campaign-analytics.entity';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailCampaignsController } from './email-campaigns.controller';
import { EmailCampaignProcessor } from './email-campaign.processor';
import { MailerModule } from '../mailer/mailer.module';
import { TicketEntity } from '../tickets/entities/ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailCampaign, EmailCampaignAnalytics, TicketEntity]),
    BullModule.registerQueue({ name: 'email-campaigns' }),
    MailerModule,
  ],
  controllers: [EmailCampaignsController],
  providers: [EmailCampaignsService, EmailCampaignProcessor],
  exports: [EmailCampaignsService],
})
export class EmailCampaignsModule {}
