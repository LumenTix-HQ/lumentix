import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';

/** Config for GeoFenceRuleType.BOUNDING_BOX */
export class BoundingBoxConfigDto {
  @ApiProperty({ example: 4.0, description: 'Southern boundary latitude' })
  @IsLatitude()
  minLat: number;

  @ApiProperty({ example: 14.0, description: 'Northern boundary latitude' })
  @IsLatitude()
  maxLat: number;

  @ApiProperty({ example: 2.0, description: 'Western boundary longitude' })
  @IsLongitude()
  minLng: number;

  @ApiProperty({ example: 15.0, description: 'Eastern boundary longitude' })
  @IsLongitude()
  maxLng: number;
}
