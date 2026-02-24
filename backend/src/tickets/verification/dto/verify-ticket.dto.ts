import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyTicketDto {
  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
