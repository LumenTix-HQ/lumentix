import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmTransferDto {
  @ApiProperty({
    description: 'The transaction hash of the on-chain transfer',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  transactionHash!: string;
}