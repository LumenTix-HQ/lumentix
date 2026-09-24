import { IsString, IsNotEmpty, IsOptional, IsLatitude, IsLongitude, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueTicketDto {
  @ApiProperty({ description: 'The payment intent ID', example: 'pi_3Jv...' })
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  /**
   * Buyer's current GPS latitude.
   * Required when the event has a RADIUS or BOUNDING_BOX geo-fence rule.
   */
  @ApiPropertyOptional({
    example: 6.5244,
    description: "Buyer's GPS latitude — required for radius/bounding-box geo-fence rules.",
  })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  /**
   * Buyer's current GPS longitude.
   * Required when the event has a RADIUS or BOUNDING_BOX geo-fence rule.
   */
  @ApiPropertyOptional({
    example: 3.3792,
    description: "Buyer's GPS longitude — required for radius/bounding-box geo-fence rules.",
  })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  /**
   * Buyer's ISO 3166-1 alpha-2 country code (e.g. "NG").
   * Required when the event has a COUNTRY_ALLOWLIST or COUNTRY_BLOCKLIST rule.
   */
  @ApiPropertyOptional({
    example: 'NG',
    description:
      "Buyer's ISO 3166-1 alpha-2 country code — required for country allowlist/blocklist rules.",
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode must be exactly 2 uppercase letters (ISO 3166-1 alpha-2)',
  })
  countryCode?: string;
}
