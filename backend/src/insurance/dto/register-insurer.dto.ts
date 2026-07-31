import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  Length,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterInsurerDto {
  @ApiProperty({ example: 'SafeGuard Insurance Ltd.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  companyName: string;

  @ApiProperty({ example: 'INS-NG-2024-00123', description: 'Regulatory license number' })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiPropertyOptional({ example: 'We specialise in event risk coverage across Africa.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://safeguard.example.com' })
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logos/safeguard.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'NG', description: 'ISO 3166-1 alpha-2 country code' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;
}
