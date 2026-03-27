import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/pagination/dto/pagination.dto';

export class ListAuditLogsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'PAYMENT_CONFIRMED', description: 'Filter by audit action type' })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ example: '2025-01-01', description: 'Filter logs created on or after this date' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Filter logs created on or before this date' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
