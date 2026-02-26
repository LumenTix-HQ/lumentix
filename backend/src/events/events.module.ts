import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './entities/event.entity';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventStateService } from './state/event-state.service';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TypeOrmModule.forFeature([Event]), forwardRef(() => TicketsModule)],
  controllers: [EventsController],
  providers: [EventsService, EventStateService],
  exports: [EventsService],
})
export class EventsModule {}
