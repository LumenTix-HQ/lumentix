import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class PaymentPathDto {
  @ApiProperty({ description: 'Source asset code (e.g. XLM)' })
  @IsString()
  @IsNotEmpty()
  sourceAsset: string;

  @ApiProperty({ description: 'Destination asset code (e.g. USDC)' })
  @IsString()
  @IsNotEmpty()
  destAsset: string;

  @ApiProperty({ description: 'Destination amount to receive' })
  @IsString()
  @IsNotEmpty()
  amount: string;
}
