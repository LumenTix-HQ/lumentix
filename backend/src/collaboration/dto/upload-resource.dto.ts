import { IsString, IsOptional, IsArray } from 'class-validator';

export class UploadResourceDto {
  @IsString()
  teamId: string;

  @IsString()
  name: string;

  @IsString()
  url: string;

  @IsString()
  type: string;

  @IsString()
  size: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
