import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Event } from '../events/entities/event.entity';
import { IpfsPinningService } from './ipfs-pinning.service';
import { Module } from '@nestjs/common';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { DecentralizedStorageController } from './decentralized-storage.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Event])],
  controllers: [DecentralizedStorageController],
  providers: [DecentralizedStorageService, IpfsPinningService],
  exports: [DecentralizedStorageService],
})
export class DecentralizedStorageModule {}
