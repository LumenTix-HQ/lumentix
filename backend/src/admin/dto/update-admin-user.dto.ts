import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../users/enums/user-role.enum';

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ enum: UserRole, description: 'Update user role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
