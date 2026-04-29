import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/pagination/dto/pagination.dto';
import { EventStatus } from '../../events/entities/event.entity';

export class ListAdminEventsDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: EventStatus,
    description: 'Filter by event status',
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus = undefined;
}
