import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/pagination/dto/pagination.dto';
import { TransactionType, TransactionStatus } from '../entities/transaction.entity';

export class ListTransactionsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TransactionType, description: 'Filter by transaction type' })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionStatus, description: 'Filter by transaction status' })
  @IsOptional()
  @IsEnum(TransactionStatus)
  txStatus?: TransactionStatus;

  @ApiPropertyOptional({ example: '2025-01-01', description: 'Filter transactions from this date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Filter transactions up to this date' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
