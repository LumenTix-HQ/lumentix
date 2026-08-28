import { ApiProperty } from '@nestjs/swagger';

export class OwnershipTransferDto {
  @ApiProperty()
  sequence: number;

  @ApiProperty()
  fromUserId: string;

  @ApiProperty()
  toUserId: string;

  @ApiProperty({ nullable: true })
  fromPublicKey: string | null;

  @ApiProperty({ nullable: true })
  toPublicKey: string | null;

  @ApiProperty({ nullable: true })
  transactionHash: string | null;

  @ApiProperty()
  timestamp: string;
}

export class ProvenanceChainDto {
  @ApiProperty()
  ticketId: string;

  @ApiProperty()
  assetCode: string;

  @ApiProperty()
  issuedAt: string;

  @ApiProperty()
  currentOwnerId: string;

  @ApiProperty({ type: [OwnershipTransferDto] })
  chain: OwnershipTransferDto[];
}