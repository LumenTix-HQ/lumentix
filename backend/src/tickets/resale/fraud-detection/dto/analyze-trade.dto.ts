import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class AnalyzeTradeDto {
  @ApiProperty({ description: 'Ticket UUID being traded' })
  @IsUUID()
  ticketId: string;

  @ApiProperty({ description: 'Event UUID the ticket belongs to' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ description: 'Buyer user UUID' })
  @IsUUID()
  buyerId: string;

  @ApiProperty({ description: 'Seller user UUID' })
  @IsUUID()
  sellerId: string;

  @ApiProperty({ description: 'Proposed or executed trade price' })
  @IsNumber()
  @IsPositive()
  price: number;
}
