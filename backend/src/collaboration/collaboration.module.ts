import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollaborationService } from './collaboration.service';
import { CollaborationController } from './collaboration.controller';
import { OrganizerTeam } from './entities/organizer-team.entity';
import { TeamMember } from './entities/team-member.entity';
import { TeamTask } from './entities/team-task.entity';
import { TeamMessage } from './entities/team-message.entity';
import { TeamResource } from './entities/team-resource.entity';
import { Event } from '../events/entities/event.entity';
import { EventsModule } from '../events/events.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizerTeam, TeamMember, TeamTask, TeamMessage, TeamResource, Event]),
    EventsModule,
    NotificationModule,
  ],
  controllers: [CollaborationController],
  providers: [CollaborationService],
  exports: [CollaborationService],
})
export class CollaborationModule {}
