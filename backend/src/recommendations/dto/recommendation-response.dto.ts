import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecommendationDto {
  @ApiProperty({ description: 'Event UUID' })
  eventId: string;

  @ApiProperty({ description: 'Event title' })
  title: string;

  @ApiProperty({ description: 'Event category' })
  category: string;

  @ApiProperty({ description: 'Event location' })
  location: string;

  @ApiProperty({ description: 'Event start date' })
  startDate: string;

  @ApiProperty({ description: 'Ticket price' })
  ticketPrice: number;

  @ApiProperty({ description: 'Currency' })
  currency: string;

  @ApiProperty({ description: 'Similarity score (0-1)' })
  score: number;

  @ApiPropertyOptional({ description: 'Reason for recommendation' })
  reason?: string;
}

export class RecommendationResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ type: [RecommendationDto], description: 'Recommended events' })
  recommendations: RecommendationDto[];

  @ApiProperty({ description: 'When the recommendations were generated' })
  generatedAt: string;
}
