import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsArray,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessInsuranceClaimDto {
  @ApiProperty({ description: 'Policy ID the claim is raised against' })
  @IsUUID('4')
  policyId: string;

  @ApiProperty({ example: 'Organiser cancelled the event 3 days before the date.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 250.0, description: 'Amount being claimed (USD)' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  requestedAmount: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://storage.example.com/evidence/screenshot.png'],
    description: 'URLs to supporting evidence files (max 10)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  evidenceUrls?: string[];
}
