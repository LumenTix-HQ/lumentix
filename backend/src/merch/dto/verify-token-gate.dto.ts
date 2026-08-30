import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class VerifyTokenGateDto {
  @ApiProperty({ description: 'Merchandise item ID', format: 'uuid' })
  @IsUUID()
  merchItemId: string;

  @ApiPropertyOptional({ description: 'Ticket ID for NFT gate verification', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({ description: 'VIP Ticket ID for badge gate verification', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vipTicketId?: string;
}
