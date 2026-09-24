import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoFenceRule } from './entities/geo-fence-rule.entity';
import { GeoFenceService } from './geo-fence.service';
import { GeoFenceController } from './geo-fence.controller';
import { Event } from '../events/entities/event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GeoFenceRule, Event]),
  ],
  controllers: [GeoFenceController],
  providers: [GeoFenceService],
  /**
   * GeoFenceService is exported so TicketsModule (and any future module)
   * can import GeoFenceModule and call enforceGeoRestriction directly
   * without duplicating geo-fence logic.
   */
  exports: [GeoFenceService],
})
export class GeoFenceModule {}
