import { IsNumber, IsString, IsNotEmpty, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListTicketForResaleDto {
  @ApiProperty({ description: 'Resale price (max 150% of original ticket price)' })
  @IsNumber()
  @Min(0.01)
  price: number;

  @ApiProperty({ example: 'XLM', description: 'Currency code for the resale price' })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
