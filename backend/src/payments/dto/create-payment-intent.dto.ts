import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({
    description: 'The UUID of the event',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  eventId: string;

  @ApiPropertyOptional({
    example: 'USDC',
    description: 'Payment currency (defaults to event currency)',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the client wants to use a path payment flow',
  })
  @IsBoolean()
  @IsOptional()
  usePathPayment?: boolean;

  @ApiPropertyOptional({
    example: 'XLM',
    description: 'Optional source asset for path payments',
  })
  @IsString()
  @IsOptional()
  sourceAsset?: string;
}
