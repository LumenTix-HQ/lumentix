import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * Request body for POST /geo-fence/events/:eventId/validate-location
 *
 * The buyer (or the client on their behalf) submits their current GPS
 * coordinates and/or country code. The service evaluates all enabled
 * geo-fence rules for the event and returns an allow/deny decision.
 *
 * Clients that can only resolve the country (e.g. via IP geolocation)
 * may omit lat/lng; rules that require coordinates will fail-safe to
 * "denied" if coordinates are absent.
 */
export class ValidateBuyerLocationDto {
  @ApiPropertyOptional({
    example: 6.5244,
    description: "Buyer's current latitude (GPS). Required for RADIUS and BOUNDING_BOX rules.",
  })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    example: 3.3792,
    description: "Buyer's current longitude (GPS). Required for RADIUS and BOUNDING_BOX rules.",
  })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    example: 'NG',
    description:
      "Buyer's ISO 3166-1 alpha-2 country code. Required for COUNTRY_ALLOWLIST and COUNTRY_BLOCKLIST rules.",
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode must be exactly 2 uppercase letters (ISO 3166-1 alpha-2)',
  })
  countryCode?: string;
}
