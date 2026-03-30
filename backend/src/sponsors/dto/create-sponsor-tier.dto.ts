import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSponsorTierDto {
  @ApiProperty({ description: 'Name of the sponsor tier', example: 'Gold Tier' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Price of the tier', example: 1000 })
  @IsNumber()
  @Min(0.01, { message: 'Tier price must be positive' })
  price: number;

  @ApiPropertyOptional({ description: 'Benefits provided to the sponsor', example: 'Logo on website' })
  @IsString()
  @IsOptional()
  benefits?: string;

  @ApiProperty({ description: 'Maximum number of sponsors for this tier', example: 5 })
  @IsNumber()
  @Min(1, { message: 'maxSponsors must be greater than 0' })
  maxSponsors: number;
}
