import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RedeemPointsDto {
  @ApiProperty({
    description: 'Number of loyalty points to redeem for a discount code',
    example: 500,
    minimum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  points: number;
}
