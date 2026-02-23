import { IsString, IsNotEmpty } from 'class-validator';

export class IssueTicketDto {
  @IsString()
  @IsNotEmpty()
  paymentId!: string;
}
