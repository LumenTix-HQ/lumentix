import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class WalletChallengeResponseDto {
  @ApiProperty({ description: 'Nonce to sign with Stellar wallet' })
  nonce: string;

  @ApiProperty({ description: 'Human-readable wallet challenge message' })
  message: string;
}

export class WalletVerifyDto {
  @ApiProperty({ description: 'The nonce that was signed' })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiProperty({ description: 'Base64-encoded signature from Stellar wallet' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: 'Stellar public key (G...) to verify' })
  @IsString()
  @IsNotEmpty()
  publicKey: string;
}
