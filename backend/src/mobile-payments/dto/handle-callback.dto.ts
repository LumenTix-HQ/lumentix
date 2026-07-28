import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HandleCallbackDto {
  @ApiProperty({ description: 'Gateway reference ID for the payment' })
  @IsString()
  @IsNotEmpty()
  gatewayReference: string;

  @ApiProperty({ description: 'Status from the payment gateway' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({ description: 'Transaction hash on the blockchain' })
  @IsString()
  @IsOptional()
  transactionHash?: string;

  @ApiPropertyOptional({ description: 'Raw response from the payment gateway' })
  @IsObject()
  @IsOptional()
  gatewayResponse?: Record<string, unknown>;
}
