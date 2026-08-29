import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { MailerModule } from '../mailer/mailer.module';
import { UsersModule } from '../users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications', // Must match the string in @Processor
    }),
    TypeOrmModule.forFeature([TicketEntity, User]),
    MailerModule,
    forwardRef(() => UsersModule),
    CalendarModule,
  ],
  controllers: [NotificationPreferencesController],
  providers: [NotificationService, NotificationProcessor, NotificationPreferencesService],
  exports: [NotificationService, NotificationPreferencesService], // Allow Payments/Sponsors to import this
})
export class NotificationModule { }
