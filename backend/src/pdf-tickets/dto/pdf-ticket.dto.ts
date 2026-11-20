import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

// ── Request DTOs ──────────────────────────────────────────────────────────────

export class GeneratePdfTicketDto {
  @ApiProperty({ description: 'UUID of the ticket to generate a PDF for', format: 'uuid' })
  @IsUUID()
  ticketId: string;
}

export class VerifyTicketSignatureDto {
  @ApiProperty({ description: 'UUID of the ticket', format: 'uuid' })
  @IsUUID()
  ticketId: string;

  @ApiProperty({
    description: 'Hex-encoded cryptographic signature to verify (as embedded in the PDF)',
    example: 'a3f9c2d1...',
  })
  @IsString()
  signature: string;
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class PdfTicketResponseDto {
  @ApiProperty({ description: 'UUID of the ticket', format: 'uuid' })
  ticketId: string;

  @ApiPropertyOptional({
    description: 'Relative URL of the generated PDF — serve from UPLOAD_PATH',
    example: '/tickets/ticket-<uuid>.pdf',
  })
  pdfUrl: string | null;
}

export class VerifyTicketSignatureResponseDto {
  @ApiProperty({ description: 'Whether the signature is valid for this ticket' })
  valid: boolean;

  @ApiProperty({ description: 'UUID of the ticket' })
  ticketId: string;
}
