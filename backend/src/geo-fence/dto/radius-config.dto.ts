import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNumber, Min } from 'class-validator';

/** Config for GeoFenceRuleType.RADIUS */
export class RadiusConfigDto {
  @ApiProperty({ example: 6.5244, description: 'Latitude of the centre point' })
  @IsLatitude()
  centerLat: number;

  @ApiProperty({ example: 3.3792, description: 'Longitude of the centre point' })
  @IsLongitude()
  centerLng: number;

  @ApiProperty({ example: 50, description: 'Allowed radius in kilometres (> 0)' })
  @IsNumber()
  @Min(0.001)
  radiusKm: number;
}
