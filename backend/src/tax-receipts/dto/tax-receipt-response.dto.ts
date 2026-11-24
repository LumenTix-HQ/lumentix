import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxFormat, TaxReceiptStatus } from '../entities/tax-receipt.entity';

export class TaxReceiptResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'payment-uuid' })
  paymentId: string;

  @ApiProperty({ example: 'user-uuid' })
  userId: string;

  @ApiProperty({ example: 'GB' })
  countryCode: string;

  @ApiProperty({ enum: TaxFormat, example: TaxFormat.VAT })
  taxFormat: TaxFormat;

  @ApiProperty({ example: 100.0 })
  subtotal: number;

  @ApiProperty({ example: 0.2, description: 'Tax rate as a decimal fraction (0–1).' })
  taxRate: number;

  @ApiProperty({ example: 20.0 })
  taxAmount: number;

  @ApiProperty({ example: 120.0 })
  total: number;

  @ApiProperty({ example: 'GBP' })
  currency: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/receipts/uuid.pdf' })
  pdfUrl: string | null;

  @ApiProperty({ enum: TaxReceiptStatus, example: TaxReceiptStatus.GENERATED })
  status: TaxReceiptStatus;

  @ApiPropertyOptional({ example: '2026-10-21T12:05:00Z' })
  emailedAt: string | null;

  @ApiProperty({ example: '2026-10-21T12:00:00Z' })
  createdAt: string;
}
