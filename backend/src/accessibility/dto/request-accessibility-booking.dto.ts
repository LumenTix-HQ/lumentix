import { IsUUID, IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccessibilityType } from '../entities/accessibility-inventory.entity';

export class RequestAccessibilityBookingDto {
  @ApiProperty({ description: 'Accessibility inventory ID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  inventoryId: string;

  @ApiProperty({ description: 'Ticket ID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  ticketId: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}
