import { ApiPropertyOptional } from '@nestjs/swagger';
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
  ticketId: string;
  eventId: string;
  eventTitle: string;
  eventDate: Date | null;
  askPrice: number;
  currency: string;
  sellerDisplayName: string;
  listedAt: Date;
}

export class MarketplaceResponseDto {
  data: MarketplaceListingDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
