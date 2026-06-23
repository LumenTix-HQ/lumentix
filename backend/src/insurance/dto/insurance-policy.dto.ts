import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InsurancePolicyStatus } from '../entities/insurance-policy.entity';

export class InsurancePolicyDto {
  @ApiProperty({
    description: 'Unique UUID of the insurance policy',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'UUID of the ticket this policy covers',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  ticketId: string;

  @ApiProperty({
    description: 'UUID of the event this policy covers',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  eventId: string;

  @ApiProperty({
    description: 'UUID of the policy holder (user)',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  userId: string;

  @ApiProperty({
    description: 'Premium paid for the insurance (10% of ticket price)',
    example: 10.5,
  })
  premiumPaid: number;

  @ApiProperty({
    description: 'Coverage amount (full ticket price)',
    example: 105.0,
  })
  coverageAmount: number;

  @ApiProperty({
    description: 'Asset code used for the premium payment',
    example: 'XLM',
  })
  currency: string;

  @ApiProperty({
    description: 'Current status of the insurance policy',
    enum: InsurancePolicyStatus,
    example: InsurancePolicyStatus.ACTIVE,
  })
  status: InsurancePolicyStatus;

  @ApiPropertyOptional({
    description: 'Cancellation reason if a claim has been filed',
    example: 'EVENT_CANCELLED_BY_ORGANIZER',
  })
  claimReason: string | null;

  @ApiPropertyOptional({
    description: 'Stellar transaction hash of the premium payment',
  })
  premiumTransactionHash: string | null;

  @ApiPropertyOptional({
    description: 'Stellar transaction hash of the claim payout',
  })
  claimTransactionHash: string | null;

  @ApiProperty({
    description: 'ISO timestamp when the policy was purchased',
    example: '2025-09-15T09:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'ISO timestamp of the last update',
    example: '2025-09-15T09:00:00.000Z',
  })
  updatedAt: Date;
}

export class InsurancePoolDto {
  @ApiProperty({
    description: 'Total number of active insurance policies',
    example: 100,
  })
  totalPolicies: number;

  @ApiProperty({
    description: 'Total number of claims processed',
    example: 5,
  })
  totalClaimsProcessed: number;

  @ApiProperty({
    description: 'Total premium collected across all policies',
    example: 5000.0,
  })
  totalPremiumCollected: number;

  @ApiProperty({
    description: 'Total coverage amount paid out in claims',
    example: 2500.0,
  })
  totalClaimsPaid: number;
}

export class InsuranceClaimResultDto {
  @ApiProperty({ description: 'Whether the claim was processed successfully' })
  success: boolean;

  @ApiProperty({ description: 'Updated insurance policy' })
  policy: InsurancePolicyDto;

  @ApiPropertyOptional({ description: 'Stellar transaction hash of the refund payout' })
  transactionHash?: string;
}
