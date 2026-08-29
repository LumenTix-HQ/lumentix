import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExchangeRateDto {
  @ApiProperty({
    description: 'Source currency code',
    example: 'USD',
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  fromCode: string;

  @ApiProperty({
    description: 'Target currency code',
    example: 'NGN',
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  toCode: string;

  @ApiProperty({
    description: 'Exchange rate (1 unit of fromCode = rate units of toCode)',
    example: 1500.5,
  })
  @IsNumber()
  @Min(0)
  rate: number;

  @ApiProperty({
    description: 'Whether this rate is considered stale',
    default: false,
  })
  @IsBoolean()
  isStale: boolean;
}
