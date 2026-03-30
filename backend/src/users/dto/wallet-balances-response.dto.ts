import { ApiProperty } from '@nestjs/swagger';

export class BalanceEntryDto {
  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 15000.0 })
  amount: number;

  @ApiProperty({ example: '₦' })
  symbol: string;

  @ApiProperty({ example: 'Nigerian Naira' })
  displayName: string;
}

export class WalletBalancesResponseDto {
  @ApiProperty({ type: [BalanceEntryDto] })
  balances: BalanceEntryDto[];

  @ApiProperty({
    example: '2025-07-04T12:00:00.000Z',
    nullable: true,
    description:
      'Timestamp of the last reconciliation run that updated these balances',
  })
  lastUpdatedAt: string | null;
}
