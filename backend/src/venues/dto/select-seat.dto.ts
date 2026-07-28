import { IsUUID, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SelectSeatDto {
  @ApiProperty({ description: 'Seat ID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  seatId: string;

  @ApiProperty({ description: 'Ticket ID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  ticketId: string;

  @ApiPropertyOptional({ description: 'Hold duration in seconds', example: 300 })
  holdDuration?: number;
}
