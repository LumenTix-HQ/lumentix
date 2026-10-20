import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { KycDocument } from './entities/kyc-document.entity';
import { VerifiedCredential } from './entities/verified-credential.entity';
import { RolesGuard } from '../admin/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([KycDocument, VerifiedCredential])],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    // RolesGuard is request-scoped per controller via @UseGuards so Reflector
    // must be available in this module's injector.
    RolesGuard,
    Reflector,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
