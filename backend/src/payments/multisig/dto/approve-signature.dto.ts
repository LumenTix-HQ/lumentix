import { IsString, IsHexadecimal } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveSignatureDto {
  @ApiProperty({ description: 'Coordinator signature (hex string)' })
  @IsHexadecimal()
  @IsString()
  signature: string;
}
