import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferTicketDto {
  // @IsString()
  // @IsNotEmpty()
  // callerOwnerId!: string;

  @ApiProperty({ description: 'The user ID of the new owner', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsString()
  @IsNotEmpty()
  newOwnerId!: string;
}
