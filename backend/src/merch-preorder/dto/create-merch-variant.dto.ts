import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateMerchVariantDto {
  @ApiPropertyOptional({ description: 'Size label, e.g. "M", "XL"' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ description: 'Color label, e.g. "Black"' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ description: 'Total stock available for this variant', example: 50 })
  @IsInt()
  @Min(0)
  stockTotal!: number;
}
