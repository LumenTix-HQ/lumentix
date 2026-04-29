import { ApiProperty } from '@nestjs/swagger';

export class EventStatsResponseDto {
  @ApiProperty() ticketsSold: number;
  @ApiProperty() ticketsUsed: number;
  @ApiProperty() ticketsRefunded: number;
  @ApiProperty() totalRevenue: number;
  @ApiProperty() totalSponsorship: number;
  @ApiProperty() refundCount: number;
  @ApiProperty({ nullable: true }) remainingCapacity: number | null;
}
