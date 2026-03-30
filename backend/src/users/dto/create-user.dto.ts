import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({ description: 'The email of the user', example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'The password of the user', example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'The role of the user', default: UserRole.EVENT_GOER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole = UserRole.EVENT_GOER;
}
