import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { EmailCampaign } from './entities/email-campaign.entity';
import { EmailCampaignVariant } from './entities/email-campaign-variant.entity';
import { EmailCampaignRecipient } from './entities/email-campaign-recipient.entity';
import { UsersModule } from '../users/users.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailCampaign, EmailCampaignVariant, EmailCampaignRecipient]),
    UsersModule,
    MailerModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
