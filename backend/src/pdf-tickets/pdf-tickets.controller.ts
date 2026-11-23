import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PdfTicketsService } from './pdf-tickets.service';
import { VerifyTicketSignatureDto } from './dto/pdf-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('PDF Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pdf-tickets')
export class PdfTicketsController {
  constructor(private readonly pdfTicketsService: PdfTicketsService) {}

  /**
   * POST /pdf-tickets/:ticketId/generate
   *
   * Issue #1544 — Generate a downloadable PDF ticket with:
   *  - Embedded QR code (payload: `{ ticketId, signature }`)
   *  - Cryptographic Ed25519 signature (anti-forgery check at scan time)
   *  - Dynamic diagonal anti-counterfeit watermark
   *
   * Only the ticket owner may call this endpoint.
   * If the ticket already has a PDF, the existing URL is returned.
   * Pass `?force=true` to regenerate.
   */
  @Post(':ticketId/generate')
  @ApiOperation({
    summary: 'Generate a PDF ticket (Issue #1544)',
    description:
      'Generates a downloadable PDF ticket with an embedded QR code, ' +
      'cryptographic signature, and anti-counterfeit watermark. ' +
      'Only the ticket owner may request generation. ' +
      'Returns the existing PDF URL if already generated (pass ?force=true to regenerate).',
  })
  @ApiParam({ name: 'ticketId', format: 'uuid' })
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Regenerate even if a PDF already exists' })
  @ApiResponse({ status: 201, description: 'PDF generated — pdfUrl contains the relative path' })
  @ApiResponse({ status: 403, description: 'Only the ticket owner can generate a PDF' })
  @ApiResponse({ status: 404, description: 'Ticket or associated event/user not found' })
  generatePdfTicket(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Req() req: AuthenticatedRequest,
    @Query('force') force?: string,
  ) {
    return this.pdfTicketsService.generatePdfTicket(
      ticketId,
      req.user.id,
      force === 'true',
    );
  }

  /**
   * POST /pdf-tickets/verify-signature
   *
   * Issue #1544 — Verify the cryptographic signature embedded in a PDF ticket.
   *
   * The signature (Ed25519 / Stellar Keypair) is generated at ticket issuance
   * and embedded in both the QR code payload and as a visible security code.
   * This endpoint allows offline verification: scan the QR, extract the
   * signature field, POST here — no live blockchain lookup required.
   */
  @Post('verify-signature')
  @ApiOperation({
    summary: 'Verify a ticket\'s cryptographic signature (Issue #1544)',
    description:
      'Verifies the Ed25519 signature embedded in a PDF ticket\'s QR code. ' +
      'Returns { valid: true } when the signature matches the ticket. ' +
      'Useful for offline gate validation without a network lookup.',
  })
  @ApiResponse({ status: 201, description: 'Verification result returned — check the `valid` field' })
  verifyTicketSignature(@Body() dto: VerifyTicketSignatureDto) {
    return this.pdfTicketsService.verifyTicketSignature(dto.ticketId, dto.signature);
  }
}
