import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { TemplateService } from './template.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [MailerService, TemplateService],
  exports: [MailerService, TemplateService],
})
export class MailerModule {}
