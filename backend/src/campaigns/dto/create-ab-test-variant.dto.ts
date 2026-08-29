import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAbTestVariantDto {
  @ApiProperty({ description: 'Short label identifying this variant', example: 'Variant A' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ description: 'Email subject line for this variant' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ description: 'Email body (HTML) for this variant' })
  @IsString()
  @IsNotEmpty()
  body!: string;
}
