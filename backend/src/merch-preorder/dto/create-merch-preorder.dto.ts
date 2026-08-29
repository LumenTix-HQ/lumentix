import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMerchPreorderDto {
  @ApiProperty({ description: 'Id of the size/color variant being pre-ordered' })
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ description: 'Id of the ticket this pre-order is attached to' })
  @IsString()
  @IsNotEmpty()
  ticketId!: string;

  @ApiPropertyOptional({ description: 'Quantity to pre-order', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
