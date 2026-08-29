import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassPackage, UserPassPackage } from './entities/pass-package.entity';
import { PassPackagesService } from './pass-packages.service';
import { PassPackagesController } from './pass-packages.controller';
import { Event } from '../events/entities/event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PassPackage, UserPassPackage, Event])],
  providers: [PassPackagesService],
  controllers: [PassPackagesController],
  exports: [PassPackagesService],
})
export class PassPackagesModule {}
