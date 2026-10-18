import { ApiProperty } from '@nestjs/swagger';

export class SponsorReportEntry {
  @ApiProperty()
  sponsorId: string;

  @ApiProperty()
  displayName: string | null;

  @ApiProperty({ description: 'Relative rotation weight' })
  weight: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  impressions: number;

  @ApiProperty()
  clicks: number;

  @ApiProperty({
    description: 'clicks / impressions, 0 when there are no impressions',
  })
  clickThroughRate: number;

  @ApiProperty({
    description: "This sponsor's share of all impressions for the event",
  })
  impressionShare: number;

  @ApiProperty({
    description:
      'Share of impressions the current weights should produce (weight / total active weight)',
  })
  expectedShare: number;
}

export class SponsorReportDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  totalImpressions: number;

  @ApiProperty()
  totalClicks: number;

  @ApiProperty({
    description: 'Overall click-through rate across all sponsors',
  })
  clickThroughRate: number;

  @ApiProperty({
    type: [SponsorReportEntry],
    description: 'Sorted by impressions, highest first',
  })
  sponsors: SponsorReportEntry[];
}
