import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { SensorStatus } from '../entities/iot-sensor.entity';

export class SensorReadingDto {
  /**
   * Raw sensor value. Interpretation depends on sensor type:
   *  - entry_counter / exit_counter: delta count since last reading
   *  - occupancy / camera_ai: absolute current occupancy
   *  - weight_plate: weight in kg (converted internally)
   *  - environmental: CO₂ ppm (used as density proxy)
   */
  @ApiProperty({ description: 'Raw sensor reading value', example: 42 })
  @IsInt()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ enum: SensorStatus, description: 'Self-reported sensor health status' })
  @IsOptional()
  @IsEnum(SensorStatus)
  status?: SensorStatus;

  @ApiPropertyOptional({ description: 'Sensor firmware version for diagnostics', example: '2.1.4' })
  @IsOptional()
  @IsString()
  firmwareVersion?: string;
}
