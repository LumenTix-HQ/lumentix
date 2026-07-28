import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Insurer } from './entities/insurer.entity';
import { InsuranceProduct } from './entities/insurance-product.entity';
import { InsurancePolicy } from './entities/insurance-policy.entity';
import { InsuranceClaim } from './entities/insurance-claim.entity';

import { InsuranceService } from './insurance.service';
import { InsuranceController } from './insurance.controller';

import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Insurer,
      InsuranceProduct,
      InsurancePolicy,
      InsuranceClaim,
    ]),
    AuditModule,
  ],
  controllers: [InsuranceController],
  providers: [InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
