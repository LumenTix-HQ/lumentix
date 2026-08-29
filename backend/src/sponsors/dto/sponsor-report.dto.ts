import { ApiProperty } from '@nestjs/swagger';

export class SponsorReportEntry {
  @ApiProperty()
  sponsorId: string;

  @ApiProperty()
  displayName: string | null;

  @ApiProperty()
  impressions: number;

  @ApiProperty()
  clicks: number;

  @ApiProperty({ description: 'clicks / impressions, 0 when there are no impressions' })
  clickThroughRate: number;
}

export class SponsorReportDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty({ type: [SponsorReportEntry] })
  sponsors: SponsorReportEntry[];
}
