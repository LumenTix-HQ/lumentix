import { IsString, IsNumberString, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateOtpDto {
  @ApiProperty({ description: 'Ticket ID' })
  @IsString()
  ticketId: string;

  @ApiProperty({ description: '6-digit OTP from QR code' })
  @IsNumberString()
  @Length(6, 6)
  otp: string;

  @ApiProperty({
    description: 'Validator device timestamp in milliseconds (optional)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  validatorTimestampMs?: number;
}
