import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BackgroundPattern, TicketLayoutElement } from '../entities/ticket-design.entity';

export class TicketLayoutElementDto implements TicketLayoutElement {
  @ApiProperty({ description: 'Layout element identifier', example: 'qr_code' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ description: 'X position as a percentage of ticket width', example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  x!: number;

  @ApiProperty({ description: 'Y position as a percentage of ticket height', example: 70 })
  @IsNumber()
  @Min(0)
  @Max(100)
  y!: number;

  @ApiPropertyOptional({ description: 'Element width as a percentage of ticket width' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  width?: number;

  @ApiPropertyOptional({ description: 'Element height as a percentage of ticket height' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  height?: number;
}

export class SaveTicketDesignDto {
  @ApiProperty({ description: 'Name of this ticket design', example: 'Summer Fest — Neon Theme' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ enum: BackgroundPattern, description: 'Background pattern style', default: BackgroundPattern.SOLID })
  @IsOptional()
  @IsEnum(BackgroundPattern)
  backgroundPattern?: BackgroundPattern;

  @ApiPropertyOptional({ description: 'Custom background image URL, required when backgroundPattern is custom_image' })
  @ValidateIf((dto: SaveTicketDesignDto) => dto.backgroundPattern === BackgroundPattern.CUSTOM_IMAGE)
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  backgroundImageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Background color hex code', default: '#FFFFFF' })
  @IsOptional()
  @IsHexColor()
  backgroundColor?: string;

  @ApiPropertyOptional({ description: 'Text color hex code', default: '#000000' })
  @IsOptional()
  @IsHexColor()
  textColor?: string;

  @ApiPropertyOptional({ description: 'Accent color hex code', default: '#6366F1' })
  @IsOptional()
  @IsHexColor()
  accentColor?: string;

  @ApiPropertyOptional({ description: 'Organizer logo URL' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  logoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Positions of layout elements (QR code, title, logo, etc.)', type: [TicketLayoutElementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketLayoutElementDto)
  layout?: TicketLayoutElementDto[];

  @ApiPropertyOptional({ description: 'Mark this design as the active design for the event', default: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
