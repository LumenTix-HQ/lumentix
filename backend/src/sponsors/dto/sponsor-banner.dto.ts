import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Public, display-only view of a sponsor banner. */
export class SponsorBannerDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  displayName: string | null;

  @ApiProperty({ nullable: true, description: 'http(s) URL, or null' })
  logoUrl: string | null;

  @ApiProperty({ nullable: true, description: 'http(s) URL, or null' })
  websiteUrl: string | null;
}

export class UpdateSponsorBannerDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: 'Relative rotation weight; 0 pauses the banner',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({
    description: 'Whether the banner is eligible for rotation',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
