import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, User])],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
  exports: [RolesGuard], // export so other modules can apply it if needed
})
export class AdminModule {}
