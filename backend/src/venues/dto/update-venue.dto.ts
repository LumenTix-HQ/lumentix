import { PartialType } from '@nestjs/swagger';
import { CreateVenueDto } from './create-venue.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VenueStatus } from '../entities/venue.entity';

export class UpdateVenueDto extends PartialType(CreateVenueDto) {
  @ApiPropertyOptional({ enum: VenueStatus })
  @IsOptional()
  @IsEnum(VenueStatus)
  status?: VenueStatus;
}
