import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCurrencyDto {
  @ApiProperty({
    description: 'ISO 4217 currency code',
    example: 'NGN',
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Matches(/^[A-Z]{3}$/, { message: 'code must be a 3-letter ISO 4217 code' })
  code: string;

  @ApiProperty({
    description: 'Full display name',
    example: 'Nigerian Naira',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName: string;

  @ApiProperty({
    description: 'Currency symbol',
    example: '₦',
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  symbol: string;

  @ApiProperty({ description: 'Whether the currency is active', default: true })
  @IsBoolean()
  isActive: boolean;
}
