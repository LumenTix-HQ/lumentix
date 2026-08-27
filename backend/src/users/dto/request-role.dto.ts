import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';

export class RequestRoleDto {
  @ApiProperty({
    enum: [UserRole.ORGANIZER, UserRole.SPONSOR],
    description: 'The role being requested',
    example: UserRole.ORGANIZER,
  })
  @IsEnum([UserRole.ORGANIZER, UserRole.SPONSOR], {
    message: 'requestedRole must be ORGANIZER or SPONSOR',
  })
  requestedRole: UserRole.ORGANIZER | UserRole.SPONSOR;

  @ApiPropertyOptional({ description: 'Optional reason for the role request', example: 'I want to host events' })
  @IsOptional()
  @IsString()
  reason?: string;
}
