import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ContributionIntentDto {
  @ApiProperty({ description: 'The UUID of the sponsor tier', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  tierId: string;
}
