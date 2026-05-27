import { IsArray, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PreferenceEntryDto {
  @ApiPropertyOptional({ description: 'Event category preference' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Location preference' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ description: 'Preference weight (higher = more interested)' })
  @IsNumber()
  @Min(0)
  weight: number;
}

export class UpdatePreferencesDto {
  @ApiProperty({ type: [PreferenceEntryDto], description: 'User preference entries' })
  @IsArray()
  preferences: PreferenceEntryDto[];
}
