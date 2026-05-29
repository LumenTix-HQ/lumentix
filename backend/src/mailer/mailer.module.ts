import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerService } from './mailer.service';
import { SendEmailProcessor } from './jobs/send-email.processor';
import { User } from '../users/entities/user.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
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
