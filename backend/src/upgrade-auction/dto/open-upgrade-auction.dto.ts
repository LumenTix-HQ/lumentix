import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenUpgradeAuctionDto {
  @ApiProperty({ description: 'Label for the premium seat tier being auctioned', example: 'Front Row VIP' })
  @IsString()
  @IsNotEmpty()
  seatTier!: string;

  @ApiProperty({ description: 'Number of upgrade slots available', example: 5 })
  @IsInt()
  @Min(1)
  slotsAvailable!: number;

  @ApiProperty({ description: 'Minimum opening bid', example: 50 })
  @IsNumber()
  @Min(0)
  startingPrice!: number;

  @ApiProperty({ description: 'Minimum amount a new bid must exceed the current highest bid by', example: 5 })
  @IsNumber()
  @Min(0.01, { message: 'Minimum increment must be positive' })
  minIncrement!: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'When bidding opens, defaults to immediately' })
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiProperty({ description: 'When bidding closes and the auction can be finalized' })
  @IsDateString()
  closesAt!: string;
}
