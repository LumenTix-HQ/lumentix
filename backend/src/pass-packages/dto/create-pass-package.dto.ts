import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsUUID,
  IsArray,
  IsDateString,
  Min,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreatePassPackageDto {
  @ApiProperty({ example: 'Summer Festival Pass' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Attend any 3 of the 5 summer shows' })
  @IsString()
  description: string;

  @ApiProperty({ example: 149.99, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ description: 'How many of the included events a holder may attend', example: 3 })
  @IsNumber()
  @Min(1)
  eventsAllowed: number;

  @ApiProperty({ description: 'Total number of events included in the package', example: 5 })
  @IsNumber()
  @Min(1)
  totalEvents: number;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID('4', { each: true })
  eventIds: string[];

  @ApiProperty({ example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  validUntil: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxPackagesToSell?: number;

  @ApiPropertyOptional({ description: 'Only honoured on update' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
