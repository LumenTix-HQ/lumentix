import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, Length, Matches } from 'class-validator';

/** Config for GeoFenceRuleType.COUNTRY_ALLOWLIST and COUNTRY_BLOCKLIST */
export class CountryListConfigDto {
  @ApiProperty({
    example: ['NG', 'GH', 'KE'],
    description: 'ISO 3166-1 alpha-2 country codes (uppercase, e.g. "NG")',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Length(2, 2, { each: true })
  @Matches(/^[A-Z]{2}$/, {
    each: true,
    message: 'Each country code must be exactly 2 uppercase letters (ISO 3166-1 alpha-2)',
  })
  countryCodes: string[];
}
