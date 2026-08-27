import { PartialType } from '@nestjs/swagger';
import { CreateVipTierDto } from './create-vip-tier.dto';

export class UpdateVipTierDto extends PartialType(CreateVipTierDto) {}
