import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateInsuranceProductDto } from './create-insurance-product.dto';
import { InsuranceProductStatus } from '../enums/insurance-product-status.enum';

export class UpdateInsuranceProductDto extends PartialType(CreateInsuranceProductDto) {
  @ApiPropertyOptional({ enum: InsuranceProductStatus })
  @IsOptional()
  @IsEnum(InsuranceProductStatus)
  status?: InsuranceProductStatus;
}
