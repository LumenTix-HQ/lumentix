import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StellarTransactionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  hash: string;

  @ApiProperty()
  ledger: number;

  @ApiProperty({ enum: ['payment', 'refund', 'contribution'] })
  type: string;

  @ApiPropertyOptional()
  amount: number | null;

  @ApiProperty({ enum: ['confirmed', 'failed'] })
  status: string;

  @ApiProperty()
  timestamp: string;

  @ApiPropertyOptional()
  fee: string | null;

  @ApiPropertyOptional()
  memo: string | null;
}
