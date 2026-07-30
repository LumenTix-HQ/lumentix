import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PurchasePolicyDto {
  @ApiProperty({ description: 'Insurance product ID to purchase' })
  @IsUUID('4')
  productId: string;

  @ApiProperty({ description: 'Event ID the policy covers' })
  @IsUUID('4')
  eventId: string;

  /** Optional Stellar transaction hash for the premium payment. */
  @ApiPropertyOptional({ description: 'Transaction hash of the premium payment' })
  @IsOptional()
  @IsString()
  paymentTxHash?: string;
}
