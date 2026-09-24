import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifySignatureDto {
  @ApiProperty({ description: 'The public key of the wallet', example: 'G...' })
  @IsString()
  publicKey: string;

  @ApiProperty({
    description:
      'Ed25519 signature of the challenge message returned by POST /wallet/challenge, base64 encoded (same convention as POST /auth/wallet/verify)',
    example: 'kX2F...==',
  })
  @IsString()
  signature: string;
}
