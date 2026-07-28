import { IsString, IsNotEmpty, IsNumber, Min, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SeatCategoryName } from '../entities/venue-section.entity';

export class CreateVenueLayoutDto {
  @ApiProperty({ description: 'Section name', example: 'Main Floor A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: SeatCategoryName, description: 'Seat category' })
  @IsEnum(SeatCategoryName)
  @IsNotEmpty()
  category: SeatCategoryName;

  @ApiProperty({ description: 'Number of rows', example: 10 })
  @IsNumber()
  @Min(1)
  rows: number;

  @ApiProperty({ description: 'Seats per row', example: 20 })
  @IsNumber()
  @Min(1)
  seatsPerRow: number;
}
