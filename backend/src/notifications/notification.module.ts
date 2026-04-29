import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { MailerModule } from '../mailer/mailer.module';
import { UsersModule } from '../users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketEntity } from '../tickets/entities/ticket.entity';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications', // Must match the string in @Processor
    }),
    TypeOrmModule.forFeature([TicketEntity]),
    MailerModule,
    forwardRef(() => UsersModule),
  ],
  providers: [NotificationService, NotificationProcessor],
  exports: [NotificationService], // Allow Payments/Sponsors to import this
})
export class NotificationModule { }
