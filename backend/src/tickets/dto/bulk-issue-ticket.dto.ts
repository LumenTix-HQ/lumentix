import { ArrayMaxSize, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkIssueTicketDto {
  @ApiProperty({ type: [String], maxItems: 50 })
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  paymentIds: string[];
}
