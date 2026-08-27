import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignVipBenefitsDto {
  @ApiProperty({ description: 'VIP tier ID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  tierId: string;

  @ApiProperty({ description: 'Ticket ID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  ticketId: string;
}
