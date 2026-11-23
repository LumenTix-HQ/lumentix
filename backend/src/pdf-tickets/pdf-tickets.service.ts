import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as qrcode from 'qrcode';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { TicketPdfService } from '../tickets/ticket-pdf.service';
import { TicketSigningService } from '../tickets/ticket-signing.service';
import {
  PdfTicketResponseDto,
  VerifyTicketSignatureResponseDto,
} from './dto/pdf-ticket.dto';

@Injectable()
export class PdfTicketsService {
  private readonly logger = new Logger(PdfTicketsService.name);

  constructor(
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,

    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly ticketPdfService: TicketPdfService,
    private readonly ticketSigningService: TicketSigningService,
  ) {}

  // ── generate_pdf_ticket ───────────────────────────────────────────────────

  /**
   * Issue #1544 — Generate a downloadable PDF ticket for the given ticketId.
   *
   * The PDF contains:
   *  - Event title, date, and location
   *  - An embedded QR code payload (`{ ticketId, signature }`) for scanner apps
   *  - A cryptographic signature (Ed25519 / Stellar Keypair) over the ticket UUID
   *  - A repeated diagonal anti-counterfeit watermark (via `embed_anti_counterfeit_watermark`)
   *
   * Rules enforced:
   *  - Only the ticket owner may request generation.
   *  - If the ticket already has a pdfUrl the existing path is returned
   *    (re-generation on demand is handled by calling with `force = true`).
   */
  async generatePdfTicket(
    ticketId: string,
    requesterId: string,
    force = false,
  ): Promise<PdfTicketResponseDto> {
    const ticket = await this.getTicketOrThrow(ticketId);

    if (ticket.ownerId !== requesterId) {
      throw new ForbiddenException('Only the ticket owner can generate a PDF for this ticket');
    }

    // Return cached URL unless the caller explicitly requests regeneration
    if (ticket.pdfUrl && !force) {
      return { ticketId: ticket.id, pdfUrl: ticket.pdfUrl };
    }

    const event = await this.eventRepo.findOne({ where: { id: ticket.eventId } });
    if (!event) throw new NotFoundException(`Event for ticket "${ticketId}" not found`);

    const user = await this.userRepo.findOne({ where: { id: ticket.ownerId } });
    if (!user) throw new NotFoundException(`Owner user for ticket "${ticketId}" not found`);

    // Build the QR payload: ticketId + cryptographic signature
    const signature = this.ticketSigningService.sign(ticket.id);
    const qrPayload = JSON.stringify({ ticketId: ticket.id, signature });
    const qrDataUrl = await qrcode.toDataURL(qrPayload);

    // Delegate to the shared PDF builder (pdfkit + watermark + QR embed)
    const pdfUrl = await this.ticketPdfService.generatePdfTicket(
      ticket,
      event,
      user.email,
      qrDataUrl,
    );

    // Persist the URL so subsequent requests skip regeneration
    ticket.pdfUrl = pdfUrl;
    await this.ticketRepo.save(ticket);

    this.logger.log(`PDF generated: ticketId=${ticket.id} owner=${requesterId} url=${pdfUrl}`);
    return { ticketId: ticket.id, pdfUrl };
  }

  // ── embed_anti_counterfeit_watermark ──────────────────────────────────────

  /**
   * Issue #1544 — Applies a dynamic anti-counterfeit watermark directly on a
   * provided PDFKit document.
   *
   * Exposed here as a service-level helper so other modules (e.g. season-pass
   * PDFs, receipt PDFs) can apply the same watermarking logic without coupling
   * to the full ticket-pdf pipeline.
   *
   * The watermark is a semi-transparent diagonal repeat of
   * `LUMENTIX · <ticketId-prefix>`, making screenshots / photocopies
   * visually distinguishable from originals without obscuring ticket details.
   */
  embedAntiCounterfeitWatermark(
    doc: PDFKit.PDFDocument,
    ticketId: string,
  ): void {
    this.ticketPdfService.embed_anti_counterfeit_watermark(doc, ticketId);
  }

  // ── verify_ticket_signature ───────────────────────────────────────────────

  /**
   * Issue #1544 — Verify the cryptographic signature embedded in a PDF ticket.
   *
   * The signature is generated at ticket issuance via TICKET_SIGNING_SECRET
   * (a Stellar keypair) and embedded in the PDF as both a visible security code
   * and encoded in the QR payload.  Verifying it offline (without network
   * access) confirms the ticket is authentic and was not forged.
   *
   * Returns `{ valid: true }` when the signature checks out.
   */
  verifyTicketSignature(
    ticketId: string,
    signature: string,
  ): VerifyTicketSignatureResponseDto {
    const valid = this.ticketPdfService.verify_ticket_signature(ticketId, signature);
    return { valid, ticketId };
  }

  // ── snake_case aliases (Issue #1544 spec requirement) ─────────────────────

  async generate_pdf_ticket(
    ticketId: string,
    requesterId: string,
    force = false,
  ): Promise<PdfTicketResponseDto> {
    return this.generatePdfTicket(ticketId, requesterId, force);
  }

  embed_anti_counterfeit_watermark(
    doc: PDFKit.PDFDocument,
    ticketId: string,
  ): void {
    return this.embedAntiCounterfeitWatermark(doc, ticketId);
  }

  verify_ticket_signature(
    ticketId: string,
    signature: string,
  ): VerifyTicketSignatureResponseDto {
    return this.verifyTicketSignature(ticketId, signature);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getTicketOrThrow(ticketId: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException(`Ticket "${ticketId}" not found`);
    return ticket;
  }
}
