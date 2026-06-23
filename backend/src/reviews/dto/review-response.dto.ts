import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewStatus } from '../entities/event-review.entity';

export class ReviewResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  eventId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  reviewerId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440003' })
  organizerId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440004' })
  ticketId: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
  rating: number;

  @ApiPropertyOptional({ example: 'Great event, well organised.' })
  comment: string | null;

  @ApiProperty({ example: true })
  attendanceVerified: boolean;

  @ApiProperty({ enum: ReviewStatus, example: ReviewStatus.VERIFIED })
  status: ReviewStatus;

  @ApiPropertyOptional({ example: 'abc123txhash' })
  blockchainTxHash: string | null;

  @ApiPropertyOptional()
  verifiedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class AttendanceVerificationResultDto {
  @ApiProperty({ description: 'Whether attendance was successfully verified' })
  verified: boolean;

  @ApiProperty({ description: 'Updated review after verification attempt' })
  review: ReviewResponseDto;

  @ApiPropertyOptional({ description: 'Reason if verification failed' })
  reason?: string;
}

export class ReputationScoreDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  organizerId: string;

  @ApiProperty({
    description: 'Weighted reputation score 0–100',
    example: 82.5,
  })
  reputationScore: number;

  @ApiProperty({ description: 'Average star rating 1–5', example: 4.2 })
  averageRating: number;

  @ApiProperty({ description: 'Total verified reviews', example: 47 })
  totalReviews: number;

  @ApiProperty({
    description: 'Count of each star rating',
    example: { '1': 1, '2': 3, '3': 8, '4': 20, '5': 15 },
  })
  ratingDistribution: Record<string, number>;

  @ApiProperty({ description: 'Standard deviation of ratings', example: 0.87 })
  ratingStdDev: number;

  @ApiProperty()
  lastCalculatedAt: Date;
}
