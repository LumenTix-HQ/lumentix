import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BridgeTransferStatus,
  SupportedChain,
} from '../entities/bridge-transfer.entity';

export class BridgeTransferResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ticket-uuid' })
  ticketId: string;

  @ApiProperty({ example: 'user-uuid' })
  userId: string;

  @ApiProperty({ enum: SupportedChain, example: SupportedChain.STELLAR })
  sourceChain: SupportedChain;

  @ApiProperty({ enum: SupportedChain, example: SupportedChain.ETHEREUM })
  destinationChain: SupportedChain;

  @ApiProperty({ example: 'GXXXXXX' })
  sourceAddress: string;

  @ApiProperty({ example: '0xDeAdBeEf' })
  destinationAddress: string;

  @ApiProperty({ example: 'LMTX_TICKET_FESTIVAL_2026' })
  sourceAssetCode: string;

  @ApiProperty({ enum: BridgeTransferStatus, example: BridgeTransferStatus.PENDING })
  status: BridgeTransferStatus;

  @ApiPropertyOptional({ example: 'abc123txhash' })
  lockTransactionHash: string | null;

  @ApiPropertyOptional({ example: '0xmintTxHash' })
  mintTransactionHash: string | null;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00Z' })
  expiresAt: string | null;

  @ApiProperty({ example: '2026-10-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-10-21T12:05:00Z' })
  updatedAt: string;
}
