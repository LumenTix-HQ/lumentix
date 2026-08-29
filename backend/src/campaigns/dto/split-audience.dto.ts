import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SplitAudienceDto {
  @ApiProperty({ description: 'User ids to split across the campaign variants and send to', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  recipientUserIds!: string[];

  @ApiPropertyOptional({
    description:
      'Relative weight per variant id, e.g. { "<variantId>": 70, "<variantId>": 30 }. Defaults to an even split across all variants.',
  })
  @IsOptional()
  @IsObject()
  variantWeights?: Record<string, number>;
}
