import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [MfaService],
  controllers: [MfaController],
  exports: [MfaService],
})
export class MfaModule {}
