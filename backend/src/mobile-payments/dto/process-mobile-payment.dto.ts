import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MobileWalletType } from '../entities/mobile-payment.entity';

export class ProcessMobilePaymentDto {
  @ApiProperty({ description: 'The UUID of the event' })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({
    enum: MobileWalletType,
    description: 'Type of mobile wallet',
  })
  @IsEnum(MobileWalletType)
  walletType: MobileWalletType;

  @ApiProperty({ description: 'Encrypted wallet payment token from the mobile SDK' })
  @IsString()
  @IsNotEmpty()
  walletToken: string;

  @ApiProperty({ example: 50, description: 'Payment amount' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 'XLM', description: 'Currency code' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Decrypted wallet credentials payload' })
  @IsString()
  @IsOptional()
  walletCredentials?: string;
}
