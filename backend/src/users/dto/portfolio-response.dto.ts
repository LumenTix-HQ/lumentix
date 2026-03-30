import { ApiProperty } from '@nestjs/swagger';

export class PortfolioEntryDto {
  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 15000.0 })
  originalAmount: number;

  @ApiProperty({ example: 9.84 })
  convertedAmount: number;

  @ApiProperty({ example: '₦' })
  symbol: string;

  @ApiProperty({ example: 'Nigerian Naira' })
  displayName: string;
}

export class PortfolioResponseDto {
  @ApiProperty({ example: 'USD' })
  baseCurrency: string;

  @ApiProperty({ example: 259.84 })
  totalValue: number;

  @ApiProperty({ type: [PortfolioEntryDto] })
  breakdown: PortfolioEntryDto[];
}
