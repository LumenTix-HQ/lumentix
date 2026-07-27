import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RequestWalletChallengeDto {
  @ApiProperty({
    description: 'Stellar public key (G...) to challenge',
    example: 'G...',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;
}
