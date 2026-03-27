import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentIntentDto {
  @ApiProperty({ description: 'The UUID of the event', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  eventId: string;
}
