import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GeoFenceRuleType } from '../enums/geo-fence-rule-type.enum';

/**
 * A single rule entry within the set_geo_fence_rules request body.
 * The `config` field is validated at the service layer (not at DTO level)
 * because class-validator cannot easily discriminate on `ruleType` inline.
 * The service calls the type-specific validator helpers before persisting.
 */
export class GeoFenceRuleInputDto {
  @ApiProperty({
    enum: GeoFenceRuleType,
    description: 'Type of geo restriction to apply',
  })
  @IsEnum(GeoFenceRuleType)
  ruleType: GeoFenceRuleType;

  @ApiPropertyOptional({
    example: '50 km radius around Lagos',
    description: 'Optional human-readable label for this rule',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    description:
      'Rule configuration object. Shape depends on ruleType:\n' +
      '  RADIUS: { centerLat, centerLng, radiusKm }\n' +
      '  BOUNDING_BOX: { minLat, maxLat, minLng, maxLng }\n' +
      '  COUNTRY_ALLOWLIST | COUNTRY_BLOCKLIST: { countryCodes: string[] }',
    example: { centerLat: 6.5244, centerLng: 3.3792, radiusKm: 50 },
  })
  @IsObject()
  @IsNotEmpty()
  config: Record<string, unknown>;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this rule is active. Defaults to true.',
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/**
 * Request body for POST /geo-fence/events/:eventId/rules
 *
 * Replaces all existing rules for the event with the provided list.
 * Pass an empty array to remove all restrictions.
 */
export class SetGeoFenceRulesDto {
  @ApiProperty({
    type: [GeoFenceRuleInputDto],
    description:
      'Full set of geo-fence rules for this event. ' +
      'This call is idempotent — existing rules are replaced entirely.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeoFenceRuleInputDto)
  rules: GeoFenceRuleInputDto[];
}
