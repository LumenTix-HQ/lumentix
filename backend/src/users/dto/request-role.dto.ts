import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export class RequestRoleDto {
  @IsEnum([UserRole.ORGANIZER, UserRole.SPONSOR], {
    message: 'requestedRole must be ORGANIZER or SPONSOR',
  })
  requestedRole: UserRole.ORGANIZER | UserRole.SPONSOR;

  @IsOptional()
  @IsString()
  reason?: string;
}
