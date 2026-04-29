import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/pagination/dto/pagination.dto';
import { RegistrationStatus } from '../entities/registration.entity';

export class ListRegistrationsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RegistrationStatus })
  @IsEnum(RegistrationStatus)
  @IsOptional()
  status?: RegistrationStatus = undefined;
}
