import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { RoleRequest } from '../users/entities/role-request.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Event, User, RoleRequest]), AuthModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
  exports: [RolesGuard],
})
export class AdminModule {}
