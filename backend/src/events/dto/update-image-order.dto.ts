import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ImageOrderItemDto {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  order: number;
}

export class UpdateImageOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageOrderItemDto)
  images: ImageOrderItemDto[];
}
