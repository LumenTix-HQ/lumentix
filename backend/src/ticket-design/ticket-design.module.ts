import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketDesignService } from './ticket-design.service';
import { TicketDesignController } from './ticket-design.controller';
import { TicketDesign } from './entities/ticket-design.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([TicketDesign]), EventsModule],
  controllers: [TicketDesignController],
  providers: [TicketDesignService],
  exports: [TicketDesignService],
})
export class TicketDesignModule {}
