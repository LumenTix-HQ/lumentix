import { IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000:abcdef...' })
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newStrongP@ssw0rd', minLength: 8 })
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
