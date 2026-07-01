import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class VerifyResalePriceDto {
  @ApiProperty({ description: 'Event ID' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ description: 'Proposed resale price to verify' })
  @IsNumber()
  @IsPositive()
  proposedPrice: number;
}
