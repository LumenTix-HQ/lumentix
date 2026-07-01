import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class SetPriceCeilingDto {
  @ApiProperty({ description: 'Event ID' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ description: 'Max multiplier in basis points (e.g., 15000 = 150%)' })
  @IsNumber()
  @IsPositive()
  ceilingMultiplierBps: number;

  @ApiProperty({ description: 'Absolute price ceiling (0 = disabled)' })
  @IsNumber()
  @IsPositive()
  absoluteCeiling: number;
}
