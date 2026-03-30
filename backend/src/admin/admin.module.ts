import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Event, User]), AuthModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
  exports: [RolesGuard], // export so other modules can apply it if needed
})
export class AdminModule {}
