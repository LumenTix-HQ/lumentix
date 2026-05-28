import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SensorType } from '../entities/iot-sensor.entity';

export class RegisterSensorDto {
  @ApiProperty({ description: 'Human-readable sensor name', example: 'Gate A Entry Counter' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiProperty({ enum: SensorType, description: 'Type of IoT sensor' })
  @IsEnum(SensorType)
  type: SensorType;

  @ApiPropertyOptional({ description: 'UUID of the section this sensor covers (omit for whole-venue sensors)' })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Physical location description', example: 'North entrance, pillar 3' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
