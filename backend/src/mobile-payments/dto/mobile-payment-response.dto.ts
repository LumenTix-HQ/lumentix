import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MobileWalletType, MobilePaymentStatus } from '../entities/mobile-payment.entity';

export class MobilePaymentResponseDto {
  @ApiProperty({ description: 'Payment ID' })
  paymentId: string;

  @ApiProperty({ enum: MobilePaymentStatus, description: 'Payment status' })
  status: MobilePaymentStatus;

  @ApiProperty({ enum: MobileWalletType, description: 'Wallet type used' })
  walletType: MobileWalletType;

  @ApiProperty({ description: 'Payment amount' })
  amount: number;

  @ApiProperty({ description: 'Payment currency' })
  currency: string;

  @ApiPropertyOptional({ description: 'Transaction hash on the Stellar network' })
  transactionHash?: string;

  @ApiPropertyOptional({ description: 'Gateway reference ID' })
  gatewayReference?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  metadata?: Record<string, unknown>;
}
