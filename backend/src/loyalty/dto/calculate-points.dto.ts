import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CalculatePointsDto {
  @ApiProperty({ description: 'User ID to calculate loyalty points for' })
  @IsUUID()
  userId: string;
}
