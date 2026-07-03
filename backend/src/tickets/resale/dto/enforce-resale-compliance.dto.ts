import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class EnforceResaleComplianceDto {
  @ApiProperty({ description: 'Event ID' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ description: 'Proposed resale price to adjust' })
  @IsNumber()
  @IsPositive()
  proposedPrice: number;
}
