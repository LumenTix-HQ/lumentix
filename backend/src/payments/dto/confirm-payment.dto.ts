import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPaymentDto {
  @ApiProperty({ description: 'The transaction hash on the Stellar network', example: '0x123abc' })
  @IsString()
  @IsNotEmpty()
  transactionHash: string;
}
