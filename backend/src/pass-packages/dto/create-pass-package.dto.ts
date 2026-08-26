import {
  IsString,
  IsNumber,
  IsUUID,
  IsArray,
  IsDateString,
  Min,
  Max,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreatePassPackageDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(1)
  eventsAllowed: number;

  @IsNumber()
  @Min(1)
  totalEvents: number;

  @IsArray()
  @IsUUID('4', { each: true })
  eventIds: string[];

  @IsDateString()
  validUntil: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxPackagesToSell?: number;
}
