import { IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateAgeProofDto {
  @ApiProperty() @IsString() userId: string;
  @ApiProperty() @IsInt() @Min(1900) @Max(2024) birthYear: number;
  @ApiProperty() @IsInt() @Min(0) minimumAge: number;
}
export class VerifyAgeProofDto {
  @ApiProperty() @IsString() proof: string;
  @ApiProperty() @IsInt() @Min(0) minimumAge: number;
}
export class RegisterZkpVerifierDto {
  @ApiProperty() @IsString() verifierId: string;
  @ApiProperty() @IsString() name: string;
}
