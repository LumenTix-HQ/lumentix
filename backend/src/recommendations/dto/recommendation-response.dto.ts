import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A single ranked event surfaced to the user by the recommendation engine. */
export class RecommendationDto {
  @ApiProperty({ example: 'uuid' })
  eventId: string;

  @ApiProperty({ example: 'Blockchain & Beer Festival 2026' })
  title: string;

  @ApiPropertyOptional({ example: 'technology' })
  category?: string | null;

  @ApiPropertyOptional({ example: 'Accra, Ghana' })
  location?: string | null;

  @ApiProperty({ example: '2026-06-14T18:00:00Z' })
  startDate: string;

  @ApiProperty({ example: 45 })
  ticketPrice: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    description:
      'Composite relevance score: similarity to the user profile vector '
      + 'plus precomputed event_similarities. Higher = more relevant.',
    example: 0.84,
  })
  score: number;

  @ApiPropertyOptional({
    example: 'You attend FinTech events in Accra',
  })
  reason?: string | null;
}

/** Envelope returned by GET /recommendations/:userId */
export class RecommendationResponse {
  @ApiProperty({ example: 'uuid' })
  userId: string;

  @ApiProperty({ type: () => [RecommendationDto] })
  recommendations: RecommendationDto[];

  @ApiProperty({ example: '2026-06-14T12:00:00Z' })
  generatedAt: string;
}
