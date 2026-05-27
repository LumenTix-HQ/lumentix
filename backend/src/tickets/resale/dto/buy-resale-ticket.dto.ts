import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BuyResaleTicketDto {
  @ApiProperty({
    description: 'Transaction hash from the Stellar payment to the seller',
  })
  @IsString()
  @IsNotEmpty()
  transactionHash: string;
}
