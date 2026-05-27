import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ConnectAttendeesDto {
  @ApiProperty({ description: 'User ID to connect with', format: 'uuid' })
  @IsUUID()
  recipientId: string;

  @ApiPropertyOptional({
    description: 'Optional message to include with the connection request',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    description: 'Event context where the connection is being made',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
