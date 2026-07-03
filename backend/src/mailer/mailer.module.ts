import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from './mailer.service';
import { SendEmailProcessor } from './jobs/send-email.processor';
import { TemplateService } from '../common/mailer/template.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  providers: [MailerService, SendEmailProcessor, TemplateService],
  exports: [MailerService, TemplateService],
})
export class MailerModule {}