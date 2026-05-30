import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferTicketDto {
  @ApiProperty({
    description: 'The Stellar public key of the recipient',
    example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsString()
  @IsNotEmpty()
  recipientPublicKey!: string;

  @ApiProperty({
    description: 'The user ID of the recipient',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  recipientUserId!: string;
}
