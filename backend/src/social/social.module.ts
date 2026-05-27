import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialProfile } from './entities/social-profile.entity';
import { AttendeeConnection } from './entities/attendee-connection.entity';
import { MeetupGroup } from './entities/meetup-group.entity';
import { MeetupMember } from './entities/meetup-member.entity';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SocialProfile,
      AttendeeConnection,
      MeetupGroup,
      MeetupMember,
    ]),
  ],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
