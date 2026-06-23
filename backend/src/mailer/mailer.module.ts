import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerService } from './mailer.service';
import { SendEmailProcessor } from './jobs/send-email.processor';
import { User } from '../users/entities/user.entity';
import { ConfigModule } from '@nestjs/config';
import { TemplateService } from '../common/mailer/template.service';

@Module({
  imports: [ConfigModule],
  providers: [MailerService, TemplateService],
  exports: [MailerService, TemplateService],
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'email',
    }),
    TypeOrmModule.forFeature([User]),
  ],
  providers: [MailerService, SendEmailProcessor],
  exports: [MailerService],
})
export class MailerModule {}
