import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class WalletVerifyDto {
  @ApiProperty({
    description: 'The nonce received from the wallet-challenge endpoint',
    example: 'a1b2c3d4...',
  })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiProperty({
    description: 'The signature of the nonce, base64 encoded',
    example: '...',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({
    description: 'The Stellar public key of the wallet',
    example: 'G...',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;
}