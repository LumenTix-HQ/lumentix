import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitReviewDto {
  @ApiProperty({
    description: 'UUID of the event to review',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  @IsUUID()
  eventId: string;

  @ApiProperty({
    description:
      'UUID of the ticket that proves attendance. ' +
      'The ticket must have status "used" — this is the anti-fake-review gate.',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsNotEmpty()
  @IsUUID()
  ticketId: string;

  @ApiProperty({
    description: 'Star rating from 1 (worst) to 5 (best)',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    description: 'Optional free-text review (max 2000 characters)',
    example: 'Great event, well organised and the speakers were excellent.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
