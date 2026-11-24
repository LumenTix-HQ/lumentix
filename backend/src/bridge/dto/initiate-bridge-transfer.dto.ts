import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  NotEquals,
} from 'class-validator';
import { SupportedChain } from '../entities/bridge-transfer.entity';

export class InitiateBridgeTransferDto {
  @ApiProperty({
    description: 'UUID of the ticket to bridge.',
    example: '3f1a2b4c-dead-beef-cafe-000000000001',
  })
  @IsUUID()
  ticketId: string;

  @ApiProperty({
    description: 'Chain where the ticket NFT currently lives.',
    enum: SupportedChain,
    example: SupportedChain.STELLAR,
  })
  @IsEnum(SupportedChain)
  sourceChain: SupportedChain;

  @ApiProperty({
    description: 'Chain that should receive the bridged token.',
    enum: SupportedChain,
    example: SupportedChain.ETHEREUM,
  })
  @IsEnum(SupportedChain)
  @NotEquals(null)
  destinationChain: SupportedChain;

  @ApiProperty({
    description: 'Sender address / public key on the source chain.',
    example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsString()
  @IsNotEmpty()
  sourceAddress: string;

  @ApiProperty({
    description: 'Recipient address on the destination chain.',
    example: '0xDeAdBeEf000000000000000000000000DeAdBeEf',
  })
  @IsString()
  @IsNotEmpty()
  destinationAddress: string;
}
