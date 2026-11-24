import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgeProofService } from './age-verification.service';
import { AgeProofController } from './age-verification.controller';
import { AgeProofVerifier } from './entities/age-proof-verifier.entity';
import { KycDocument } from '../identity/entities/kyc-document.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AgeProofVerifier, KycDocument])],
  controllers: [AgeProofController],
  providers: [AgeProofService],
  exports: [AgeProofService],
})
export class AgeVerificationModule {}
