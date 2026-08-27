import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VipService } from './vip.service';
import { VipController } from './vip.controller';
import { VipTier } from './entities/vip-tier.entity';
import { VipAssignment } from './entities/vip-assignment.entity';
import { EventsModule } from '../events/events.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VipTier, VipAssignment]),
    EventsModule,
    TicketsModule,
  ],
  controllers: [VipController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
