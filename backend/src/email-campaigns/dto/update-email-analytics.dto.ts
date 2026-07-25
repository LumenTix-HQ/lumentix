import { IsInt, Min, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmailAnalyticsDto {
  @ApiPropertyOptional({ example: 120, description: 'Total delivered count' })
  @IsInt()
  @Min(0)
  @IsOptional()
  totalDelivered?: number;

  @ApiPropertyOptional({ example: 80, description: 'Total opened count' })
  @IsInt()
  @Min(0)
  @IsOptional()
  totalOpened?: number;

  @ApiPropertyOptional({ example: 40, description: 'Total clicked count' })
  @IsInt()
  @Min(0)
  @IsOptional()
  totalClicked?: number;

  @ApiPropertyOptional({ example: 5, description: 'Total bounced count' })
  @IsInt()
  @Min(0)
  @IsOptional()
  totalBounced?: number;

  @ApiPropertyOptional({ example: 2, description: 'Total unsubscribed count' })
  @IsInt()
  @Min(0)
  @IsOptional()
  totalUnsubscribed?: number;
}
