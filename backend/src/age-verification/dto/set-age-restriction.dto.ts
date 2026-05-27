import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AgeRestriction } from '../entities/age-verification.entity';

export class SetAgeRestrictionDto {
  @ApiProperty({
    enum: AgeRestriction,
    description: 'Age restriction for the event',
    example: AgeRestriction.EIGHTEEN_PLUS,
  })
  @IsEnum(AgeRestriction)
  @IsNotEmpty()
  ageRestriction: AgeRestriction;
}
