import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccessibilityType } from '../entities/accessibility-inventory.entity';

export class SetupAccessibilityInventoryDto {
  @ApiProperty({ enum: AccessibilityType, description: 'Type of accessibility accommodation' })
  @IsEnum(AccessibilityType)
  @IsNotEmpty()
  type: AccessibilityType;

  @ApiProperty({ description: 'Total number of slots', example: 10 })
  @IsNumber()
  @Min(1)
  totalSlots: number;

  @ApiPropertyOptional({ description: 'Description of accommodations provided' })
  @IsString()
  @IsOptional()
  description?: string;
}
