import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { StreamingService } from './streaming.service';
import { StreamingController } from './streaming.controller';
import { StreamingConfig } from './entities/streaming-config.entity';
import { Event } from '../events/entities/event.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([StreamingConfig, Event]),
  ],
  controllers: [StreamingController],
  providers: [StreamingService],
  exports: [StreamingService],
})
export class StreamingModule {}
