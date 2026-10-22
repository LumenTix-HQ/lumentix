import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class GenerateTaxReceiptDto {
  @ApiProperty({
    description: 'UUID of the payment to generate a receipt for.',
    example: 'payment-uuid',
  })
  @IsUUID()
  paymentId: string;

  @ApiProperty({
    description:
      'ISO 3166-1 alpha-2 country code that determines the tax regime ' +
      '(e.g. "GB" → 20 % VAT, "AU" → 10 % GST, "US" → state sales tax).',
    example: 'GB',
  })
  @IsISO31661Alpha2()
  countryCode: string;

  @ApiPropertyOptional({
    description:
      'US state code (two-letter, e.g. "CA") — only relevant when countryCode is "US".',
    example: 'CA',
  })
  @IsString()
  @IsOptional()
  stateCode?: string;

  @ApiPropertyOptional({
    description: 'Email address to send the receipt to. Defaults to the user's registered email.',
    example: 'buyer@example.com',
  })
  @IsString()
  @IsOptional()
  recipientEmail?: string;
}
