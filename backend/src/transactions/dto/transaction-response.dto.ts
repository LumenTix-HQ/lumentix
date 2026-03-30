import { ApiProperty } from '@nestjs/swagger';

export class TransactionResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId: string;

  @ApiProperty({ example: 150.0 })
  amount: number;

  @ApiProperty({ example: 'XLM' })
  currency: string;

  @ApiProperty({
    example: '₳',
    description: 'Symbol from the currencies table',
  })
  currencySymbol: string;

  @ApiProperty({
    example: 'Stellar Lumens',
    description: 'Full name from the currencies table',
  })
  currencyDisplayName: string;

  @ApiProperty({
    example: 'payment',
    enum: ['payment', 'refund', 'contribution'],
  })
  type: string;

  @ApiProperty({
    example: 'confirmed',
    enum: ['pending', 'confirmed', 'failed'],
  })
  status: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    nullable: true,
  })
  referenceId: string | null;

  @ApiProperty({ example: 'abc123txhash', nullable: true })
  transactionHash: string | null;

  @ApiProperty()
  createdAt: Date;
}
