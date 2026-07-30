import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordGateScanDto {
  @ApiProperty({ description: 'Identifier of the entry gate that performed the scan', example: 'Gate A' })
  @IsString()
  @IsNotEmpty()
  gateId!: string;

  @ApiProperty({ description: 'Id of the ticket that was scanned', example: 'b3f1c2b0-...' })
  @IsString()
  @IsNotEmpty()
  ticketId!: string;
}
