import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsOfServiceService } from './terms-of-service.service';
import { TermsOfServiceController } from './terms-of-service.controller';
import { EventTermsOfService } from './entities/event-tos.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([EventTermsOfService]), EventsModule],
  providers: [TermsOfServiceService],
  controllers: [TermsOfServiceController],
  exports: [TermsOfServiceService],
})
export class TermsOfServiceModule {}
