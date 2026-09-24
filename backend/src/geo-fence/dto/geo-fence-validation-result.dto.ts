import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GeoFenceRuleType } from '../enums/geo-fence-rule-type.enum';

/** Per-rule evaluation detail returned in the validation result */
export class RuleEvaluationDetailDto {
  @ApiProperty({ description: 'UUID of the evaluated rule' })
  ruleId: string;

  @ApiProperty({ enum: GeoFenceRuleType })
  ruleType: GeoFenceRuleType;

  @ApiPropertyOptional({ description: 'Human-readable label set by the organizer' })
  description: string | null;

  @ApiProperty({ description: 'Whether this individual rule passed' })
  passed: boolean;

  @ApiProperty({
    description:
      'Human-readable reason for the outcome of this rule, e.g. ' +
      '"Location is within the allowed 50 km radius" or ' +
      '"Country NG is not in the allowed list"',
  })
  reason: string;
}

/**
 * Response body for POST /geo-fence/events/:eventId/validate-location
 * and the internal enforce_geo_restriction check.
 */
export class GeoFenceValidationResultDto {
  @ApiProperty({ description: 'true if ALL enabled rules passed; false if any rule failed' })
  allowed: boolean;

  @ApiPropertyOptional({
    description:
      'Aggregated denial reason when allowed=false. ' +
      'Suitable for surfacing to the buyer.',
  })
  denialReason: string | null;

  @ApiProperty({ type: [RuleEvaluationDetailDto], description: 'Per-rule breakdown' })
  details: RuleEvaluationDetailDto[];
}
