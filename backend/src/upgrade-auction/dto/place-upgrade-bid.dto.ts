import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PlaceUpgradeBidDto {
  @ApiProperty({ description: 'Id of the ticket bidding to upgrade its seat' })
  @IsString()
  @IsNotEmpty()
  ticketId!: string;

  @ApiProperty({ description: 'Bid amount', example: 75 })
  @IsNumber()
  @Min(0.01, { message: 'Bid amount must be positive' })
  amount!: number;
}
