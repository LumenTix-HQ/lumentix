import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkIssueResultDto {
  @ApiProperty()
  paymentId: string;

  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  ticketId?: string;

  @ApiPropertyOptional()
  error?: string;
}
