import { ApiProperty } from '@nestjs/swagger';

export class AgeDistributionBucket {
  @ApiProperty({ description: 'Age range label (e.g., "18-25")' })
  ageRange: string;

  @ApiProperty({ description: 'Count of attendees in this range' })
  count: number;

  @ApiProperty({ description: 'Percentage of total attendees' })
  percentage: number;
}

export class DemographicBreakdown {
  @ApiProperty({ description: 'Age ranges verified' })
  verifiedAges: AgeDistributionBucket[];

  @ApiProperty({ description: 'Percentage of attendees with age verification' })
  ageVerificationRate: number;

  @ApiProperty({ description: 'Average age of attendees (if available)' })
  averageAge: number | null;

  @ApiProperty({ description: 'Youngest attendee age (if available)' })
  minAge: number | null;

  @ApiProperty({ description: 'Oldest attendee age (if available)' })
  maxAge: number | null;
}

export class CurrencyBreakdown {
  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Number of tickets sold in this currency' })
  ticketCount: number;

  @ApiProperty({ description: 'Total revenue in this currency' })
  totalAmount: number;

  @ApiProperty({ description: 'Percentage of total tickets' })
  percentage: number;
}

export class DemographicsReportDto {
  @ApiProperty({ type: DemographicBreakdown })
  demographics: DemographicBreakdown;

  @ApiProperty({
    type: [CurrencyBreakdown],
    description: 'Breakdown by currency',
  })
  currencyBreakdown: CurrencyBreakdown[];

  @ApiProperty({ description: 'Total unique attendees' })
  totalAttendees: number;

  @ApiProperty({ description: 'Total registrations (includes cancelled/refunded)' })
  totalRegistrations: number;

  @ApiProperty({ description: 'Repeat attendees (attended this event before)' })
  repeatAttendeeCount: number;

  @ApiProperty({ description: 'Percentage of repeat attendees' })
  repeatAttendeePercentage: number;
}
