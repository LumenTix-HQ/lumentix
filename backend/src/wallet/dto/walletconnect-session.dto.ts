import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InitiateWalletConnectDto {
  @ApiProperty({ description: 'Stellar public key to associate with the WalletConnect session' })
  @IsNotEmpty()
  @IsString()
  publicKey: string;
}

export class ApproveWalletSessionDto {
  @ApiProperty({ description: 'WalletConnect session ID returned by the initiate call' })
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'Stellar public key of the approving wallet' })
  @IsNotEmpty()
  @IsString()
  publicKey: string;

  @ApiProperty({ description: 'Pairing topic of the WalletConnect session' })
  @IsNotEmpty()
  @IsString()
  topic: string;
}

export class DisconnectWalletDto {
  @ApiProperty({ description: 'WalletConnect session ID to disconnect' })
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({ description: 'Stellar public key to verify ownership' })
  @IsNotEmpty()
  @IsString()
  publicKey: string;
}
