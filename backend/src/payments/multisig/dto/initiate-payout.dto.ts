import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiatePayoutDto {
  @ApiProperty({ description: 'Event ID' })
  @IsString()
  eventId: string;

  @ApiProperty({ description: 'Organizer wallet address' })
  @IsString()
  organizerWallet: string;

  @ApiProperty({ description: 'Payout amount' })
  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @ApiProperty({ description: 'Currency code', default: 'XLM', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Number of required signatures', default: 2, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  requiredSignatures?: number;
}
