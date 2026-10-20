import { IsString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateAgeProofDto {
  /**
   * Minimum age the caller wants to prove they meet. The actual date of birth
   * is never accepted from the client — it is read from the user's verified
   * KYC record.
   */
  @ApiProperty({ description: 'Minimum age to prove', minimum: 0 })
  @IsInt()
  @Min(0)
  minimumAge: number;
}

export class VerifyAgeProofDto {
  @ApiProperty() @IsString() proof: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) minimumAge: number;
}

export class RegisterAgeProofVerifierDto {
  @ApiProperty() @IsString() verifierId: string;
  @ApiProperty() @IsString() name: string;
}
