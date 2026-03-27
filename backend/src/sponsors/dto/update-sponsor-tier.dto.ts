import { PartialType } from '@nestjs/swagger';
import { CreateSponsorTierDto } from './create-sponsor-tier.dto';

export class UpdateSponsorTierDto extends PartialType(CreateSponsorTierDto) {}
