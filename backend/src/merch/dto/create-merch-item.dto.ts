import { IsBoolean, IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TokenGateType } from '../entities/merch-item.entity';
import { VipTierName } from '../../vip/entities/vip-tier.entity';

export class CreateMerchItemDto {
  @ApiProperty({ description: 'Merchandise item name', example: 'Limited Edition Tour Hoodie' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Merchandise item description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Price of the item', example: 45 })
  @IsNumber()
  @Min(0.01, { message: 'Price must be positive' })
  price!: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Total available stock', example: 100 })
  @IsNumber()
  @Min(0)
  totalStock!: number;

  @ApiPropertyOptional({ description: 'Whether this item is restricted to token holders', default: false })
  @IsOptional()
  @IsBoolean()
  isTokenGated?: boolean;

  @ApiPropertyOptional({ description: 'Type of token gate required to purchase', enum: ['ticket_nft', 'vip_badge'] })
  @ValidateIf((dto: CreateMerchItemDto) => !!dto.isTokenGated)
  @IsIn(['ticket_nft', 'vip_badge'])
  gateType?: TokenGateType;

  @ApiPropertyOptional({ description: 'Required ticket NFT asset code when gateType is ticket_nft' })
  @ValidateIf((dto: CreateMerchItemDto) => dto.gateType === 'ticket_nft')
  @IsString()
  @IsNotEmpty()
  requiredAssetCode?: string;

  @ApiPropertyOptional({ description: 'Required VIP tier name when gateType is vip_badge', enum: VipTierName })
  @ValidateIf((dto: CreateMerchItemDto) => dto.gateType === 'vip_badge')
  @IsEnum(VipTierName)
  requiredVipTier?: VipTierName;
}
