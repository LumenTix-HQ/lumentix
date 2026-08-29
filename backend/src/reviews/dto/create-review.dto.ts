import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewableType } from '../entities/review.entity';

export class CreateReviewDto {
  @ApiProperty({ enum: ReviewableType })
  @IsEnum(ReviewableType)
  reviewableType: ReviewableType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reviewableId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;
}
