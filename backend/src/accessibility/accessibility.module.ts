import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessibilityService } from './accessibility.service';
import { AccessibilityController } from './accessibility.controller';
import { AccessibilityInventory } from './entities/accessibility-inventory.entity';
import { AccessibilityBooking } from './entities/accessibility-booking.entity';
import { EventsModule } from '../events/events.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessibilityInventory, AccessibilityBooking]),
    EventsModule,
    TicketsModule,
  ],
  controllers: [AccessibilityController],
  providers: [AccessibilityService],
  exports: [AccessibilityService],
})
export class AccessibilityModule {}
