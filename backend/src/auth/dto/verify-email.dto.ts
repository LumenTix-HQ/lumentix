import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'ID of the user whose email is being verified' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Raw verification token from the email link' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
