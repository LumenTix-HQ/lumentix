import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  ticketIssued?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  paymentFailed?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  eventCancelled?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  sponsorConfirmed?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  eventCompleted?: boolean;
}
