import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IssueTicketDto {
  @ApiProperty({ description: 'The payment intent ID', example: 'pi_3Jv...' })
  @IsString()
  @IsNotEmpty()
  paymentId!: string;
}
