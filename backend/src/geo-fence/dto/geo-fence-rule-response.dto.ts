import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GeoFenceRuleType } from '../enums/geo-fence-rule-type.enum';

/** Serialised representation of a single GeoFenceRule returned by the API */
export class GeoFenceRuleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  eventId: string;

  @ApiProperty({ enum: GeoFenceRuleType })
  ruleType: GeoFenceRuleType;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ description: 'Rule-type-specific configuration object' })
  config: Record<string, unknown>;

  @ApiProperty()
  isEnabled: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
