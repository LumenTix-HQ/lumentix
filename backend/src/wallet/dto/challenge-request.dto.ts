import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChallengeRequestDto {
  @ApiProperty({ description: 'The public key of the wallet', example: 'G...' })
  @IsString()
  publicKey: string;
}
