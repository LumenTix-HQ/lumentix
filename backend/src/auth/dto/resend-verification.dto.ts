import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ description: 'Email address to resend verification' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
