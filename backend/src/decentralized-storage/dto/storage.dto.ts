import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadMediaDto {
  @ApiProperty() @IsUUID() eventId: string;
  @ApiProperty() @IsString() fileName: string;
  @ApiProperty() @IsString() mimeType: string;
  @ApiProperty() @MaxLength(10_000_000) @IsString() content: string;
  @ApiPropertyOptional({ enum: ['utf8', 'base64'], default: 'utf8' })
  @IsOptional()
  @IsIn(['utf8', 'base64'])
  contentEncoding?: 'utf8' | 'base64';
}
export class PinMediaDto {
  @ApiProperty() @IsUUID() eventId: string;
  @ApiProperty() @IsString() hash: string;
}

export class MigrateMediaDto {
  @ApiProperty() @IsUUID() eventId: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  hashes: string[];
}
