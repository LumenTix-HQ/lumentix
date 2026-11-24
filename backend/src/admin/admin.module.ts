import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';
import { Event } from '../events/entities/event.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { RoleRequest } from '../users/entities/role-request.entity';
import { StellarWebhookModule } from '../stellar/stellar-webhook.module';
import { AuditModule } from '../audit/audit.module';
import { MailerModule } from '../mailer/mailer.module';
import { EventStateService } from '../events/state/event-state.service';
import { EventCacheService } from '../events/cache/event-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, User, RoleRequest, RefreshToken]),
    StellarWebhookModule,
    AuditModule,
    MailerModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard, EventStateService, EventCacheService],
  exports: [RolesGuard],
})
export class AdminModule {}
