import { ApiProperty } from '@nestjs/swagger';

export class ImpactReportResponseDto {
  @ApiProperty()
  reportId: string;

  @ApiProperty()
  eventId: string;

  @ApiProperty()
  generatedAt: string;

  @ApiProperty()
  format: string;

  @ApiProperty()
  data: any;

  @ApiProperty()
  summary: {
    overallImpactScore: number;
    economicScore: number;
    socialScore: number;
    environmentalScore: number;
  };
}
