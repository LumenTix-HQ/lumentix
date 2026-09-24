import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { KycDocument } from './entities/kyc-document.entity';
import { VerifiedCredential } from './entities/verified-credential.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KycDocument, VerifiedCredential])],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
