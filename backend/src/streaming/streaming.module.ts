import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { StreamingService } from './streaming.service';
import { AdaptiveBitrateService } from './adaptive-bitrate.service';
import { StreamingController } from './streaming.controller';
import { AdaptiveBitrateController } from './adaptive-bitrate.controller';
import { StreamingConfig } from './entities/streaming-config.entity';
import { ViewerStreamSession } from './entities/viewer-stream-session.entity';
import { Event } from '../events/entities/event.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([StreamingConfig, ViewerStreamSession, Event]),
  ],
  controllers: [StreamingController, AdaptiveBitrateController],
  providers: [StreamingService, AdaptiveBitrateService],
  exports: [StreamingService, AdaptiveBitrateService],
})
export class StreamingModule {}
