import { IsDateString, IsOptional, IsString } from 'class-validator';

export class DuplicateEventDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @IsOptional()
  title?: string;
}
