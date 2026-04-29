import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditRetentionJob } from './jobs/audit-retention.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  providers: [AuditService, AuditRetentionJob],
  exports: [AuditService],
})
export class AuditModule { }
