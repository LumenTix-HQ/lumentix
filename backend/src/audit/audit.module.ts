import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditPruningJob } from './jobs/audit-pruning.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  providers: [AuditService, AuditPruningJob],
  exports: [AuditService],
})
export class AuditModule {}