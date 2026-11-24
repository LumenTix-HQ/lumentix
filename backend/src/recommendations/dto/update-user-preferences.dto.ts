import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One coordinate of the user's implicit profile vector.
 * Each entry contributes a weighted (category, location) factor to the
 * recommendation scoring (#1243).
 */
export class PreferenceEntryDto {
  @ApiPropertyOptional({ example: 'technology' })
  category?: string | null;

  @ApiPropertyOptional({ example: 'Accra, Ghana' })
  location?: string | null;

  @ApiProperty({
    description: 'How strongly this factor shapes the user profile (0-100).',
    example: 80,
    minimum: 0,
    maximum: 100,
  })
  weight: number;
}

export class UpdateUserPreferencesDto {
  @ApiProperty({ type: () => [PreferenceEntryDto] })
  preferences: PreferenceEntryDto[];
}

/** Result of replacing a user's preference rows. */
export class UpdateUserPreferencesResultDto {
  @ApiProperty({ example: 'uuid' })
  userId: string;

  @ApiProperty({ example: 3, description: 'Number of preference rows saved.' })
  saved: number;
}
