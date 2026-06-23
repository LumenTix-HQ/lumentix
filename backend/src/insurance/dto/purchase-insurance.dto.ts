import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class PurchaseInsuranceDto {
  @ApiProperty({
    description: 'UUID of the ticket to purchase insurance for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  ticketId: string;
}
