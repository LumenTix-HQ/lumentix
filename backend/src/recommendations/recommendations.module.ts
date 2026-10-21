import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserPreference } from './entities/user-preference.entity';
import { EventSimilarity } from './entities/event-similarity.entity';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';

import { Event } from '../events/entities/event.entity';
import { Registration } from '../registrations/entities/registration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserPreference,
      EventSimilarity,
      Event,
      Registration,
    ]),
  ],
  providers: [RecommendationsService],
  controllers: [RecommendationsController],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
