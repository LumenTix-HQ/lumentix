import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgeVerification } from './entities/age-verification.entity';
import { AgeVerificationService } from './age-verification.service';
import { AgeVerificationController } from './age-verification.controller';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgeVerification, Event, User]),
    AuditModule,
  ],
  controllers: [AgeVerificationController],
  providers: [AgeVerificationService],
  exports: [AgeVerificationService],
})
export class AgeVerificationModule {}
