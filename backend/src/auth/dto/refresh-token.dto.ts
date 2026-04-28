import { IsString, IsNotEmpty } from 'class-validator';
export class RefreshTokenDto {
  @IsString() @IsNotEmpty() refreshToken: string;
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token issued during login',
    example: 'd1e2f3g4...',
  })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
