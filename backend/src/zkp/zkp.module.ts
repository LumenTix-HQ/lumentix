import { Module } from '@nestjs/common';
import { ZkpService } from './zkp.service';
import { ZkpController } from './zkp.controller';

@Module({
  controllers: [ZkpController],
  providers: [ZkpService],
  exports: [ZkpService],
})
export class ZkpModule {}
