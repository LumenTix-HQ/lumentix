import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseMerchDto {
  @ApiPropertyOptional({ description: 'Ticket id proving ownership of the required ticket NFT' })
  @IsOptional()
  @IsString()
  ticketId?: string;

  @ApiPropertyOptional({ description: 'Ticket id used to look up a VIP badge assignment' })
  @IsOptional()
  @IsString()
  vipTicketId?: string;
}
