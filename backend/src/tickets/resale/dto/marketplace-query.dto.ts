import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * Query parameters for the public resale marketplace (issue #861).
 */
export class MarketplaceQueryDto {
  @ApiPropertyOptional({ description: 'Only return listings for this event' })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Capped: this endpoint is unauthenticated, so an uncapped limit is a cheap
  // way for anyone to ask the database for every listing at once.
  @Max(100)
  limit?: number = 20;
}

/** A single row in the public marketplace listing. */
export class MarketplaceListingDto {
  @ApiProperty({ format: 'uuid' })
  ticketId: string;
  @ApiProperty({ format: 'uuid' })
  eventId: string;
  @ApiProperty()
  eventTitle: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  eventDate: Date | null;
  @ApiProperty()
  askPrice: number;
  @ApiProperty()
  currency: string;
  @ApiProperty()
  sellerDisplayName: string;
  @ApiProperty({ type: String, format: 'date-time' })
  listedAt: Date;
}

export class MarketplaceResponseDto {
  @ApiProperty({ type: [MarketplaceListingDto] })
  data: MarketplaceListingDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
  @ApiProperty()
  totalPages: number;
}
