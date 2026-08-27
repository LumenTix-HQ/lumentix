import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadMediaDto {
  @ApiProperty() @IsString() eventId: string;
  @ApiProperty() @IsString() fileName: string;
  @ApiProperty() @IsString() mimeType: string;
  @ApiProperty() @IsString() content: string;
}
export class PinMediaDto {
  @ApiProperty() @IsString() eventId: string;
  @ApiProperty() @IsString() hash: string;
}
