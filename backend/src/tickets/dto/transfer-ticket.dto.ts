import { IsString, IsNotEmpty } from 'class-validator';

export class TransferTicketDto {
  // @IsString()
  // @IsNotEmpty()
  // callerOwnerId!: string;

  @IsString()
  @IsNotEmpty()
  newOwnerId!: string;
}
