import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddWorkspaceMemberDto {
  @ApiProperty({ description: 'User id of the organizer team member to add' })
  @IsUUID()
  userId: string;
}
