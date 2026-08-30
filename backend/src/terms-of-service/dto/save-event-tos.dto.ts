import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class SaveEventTosDto {
  @ApiProperty({ description: 'Main terms of service content' })
  @IsString()
  termsContent: string;

  @ApiPropertyOptional({ description: 'Liability disclaimers appended by organizer' })
  @IsOptional()
  @IsString()
  liabilityDisclaimers?: string;

  @ApiPropertyOptional({ description: 'Custom legal agreements from organizer' })
  @IsOptional()
  @IsString()
  customAgreements?: string;
}

export class FetchTosForCheckoutDto {
  @ApiProperty({ description: 'Event ID', format: 'uuid' })
  @IsUUID()
  eventId: string;
}
