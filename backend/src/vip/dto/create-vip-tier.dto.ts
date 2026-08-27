import { IsString, IsNotEmpty, IsNumber, IsArray, IsOptional, Min, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VipTierName } from '../entities/vip-tier.entity';

export class CreateVipTierDto {
  @ApiProperty({ enum: VipTierName, description: 'VIP tier name', example: VipTierName.GOLD })
  @IsEnum(VipTierName)
  @IsNotEmpty()
  name: VipTierName;

  @ApiProperty({ description: 'Price of the VIP tier', example: 500 })
  @IsNumber()
  @Min(0.01, { message: 'Tier price must be positive' })
  price: number;

  @ApiProperty({ description: 'Maximum number of slots', example: 50 })
  @IsNumber()
  @Min(1, { message: 'maxSlots must be at least 1' })
  maxSlots: number;

  @ApiPropertyOptional({ description: 'List of VIP benefits', example: ['Early Entry', 'Exclusive Lounge', 'Merchandise'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  benefits?: string[];
}
