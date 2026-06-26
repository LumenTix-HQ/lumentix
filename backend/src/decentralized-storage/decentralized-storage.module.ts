import { Module } from '@nestjs/common';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { DecentralizedStorageController } from './decentralized-storage.controller';

@Module({
  controllers: [DecentralizedStorageController],
  providers: [DecentralizedStorageService],
  exports: [DecentralizedStorageService],
})
export class DecentralizedStorageModule {}
