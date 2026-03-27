import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifySignatureDto {
  @ApiProperty({ description: 'The public key of the wallet', example: 'G...' })
  @IsString()
  publicKey: string;

  @ApiProperty({ description: 'The signature to verify', example: 'abcd...' })
  @IsString()
  signature: string;
}
