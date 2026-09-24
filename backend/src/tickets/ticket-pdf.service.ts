import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { TicketEntity } from './entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { TicketSigningService } from './ticket-signing.service';

@Injectable()
export class TicketPdfService {
  constructor(private readonly ticketSigningService: TicketSigningService) {}

  /**
   * Analytics #991 — generates the downloadable PDF ticket: event details,
   * an embedded QR code, a cryptographic signature (so the ticket can be
   * verified offline via `verifyTicketSignature`), and a diagonal
   * anti-counterfeit watermark.
   *
   * Kept as `generate()` too (an alias) since existing callers already use
   * that name.
   */
  async generatePdfTicket(
    ticket: TicketEntity,
    event: any,
    userEmail: string,
    qrDataUrl: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A5', margin: 30 });
        const name = `ticket-${ticket.id}.pdf`;
        const uploadPath = process.env.UPLOAD_PATH ?? './uploads';
        const dest = path.join(uploadPath, 'tickets', name);

        // Ensure directory exists
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });

        const stream = fs.createWriteStream(dest);
        doc.pipe(stream);

        this.embed_anti_counterfeit_watermark(doc, ticket.id);

        doc.fontSize(18).text(event.title, { align: 'center' });
        doc.moveDown();
        doc.fontSize(11).text(`Attendee: ${userEmail}`);
        doc.text(`Ticket ID: ${ticket.id}`);
        doc.text(`Date: ${new Date(event.startDate).toISOString()}`);
        doc.text(`Location: ${event.location ?? 'Online'}`);
        doc.moveDown();

        // Embed QR code image
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
        doc.image(qrBuffer, { width: 150, align: 'center' });

        // Visible security code: a truncated cryptographic signature over
        // the ticket ID, so a physical/printed copy can be spot-checked
        // (via `verifyTicketSignature`) without needing the QR scanner.
        const signature = this.ticketSigningService.sign(ticket.id);
        doc.moveDown();
        doc
          .fontSize(7)
          .fillColor('#888888')
          .text(`Security code: ${signature.slice(0, 24)}…`, { align: 'center' });

        doc.end();

        stream.on('finish', () => {
          resolve(`/tickets/${name}`);
        });

        stream.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /** @deprecated use `generatePdfTicket` — kept as an alias for existing callers. */
  async generate(
    ticket: TicketEntity,
    event: any,
    userEmail: string,
    qrDataUrl: string,
  ): Promise<string> {
    return this.generatePdfTicket(ticket, event, userEmail, qrDataUrl);
  }

  /** Generate a signed PDF ticket with its QR code and watermark. */
  async generate_pdf_ticket(
    ticket: TicketEntity,
    event: any,
    userEmail: string,
    qrDataUrl: string,
  ): Promise<string> {
    return this.generatePdfTicket(ticket, event, userEmail, qrDataUrl);
  }

  /**
   * Analytics #991 — draws a repeated, semi-transparent diagonal watermark
   * across the current page so a photocopy/screenshot is visibly
   * distinguishable from an original, without obscuring the ticket details.
   */
  embedAntiCounterfeitWatermark(doc: PDFKit.PDFDocument, ticketId: string) {
    const label = `LUMENTIX · ${ticketId.slice(0, 8).toUpperCase()}`;
    const { width, height } = doc.page;

    doc.save();
    doc.rotate(-35, { origin: [width / 2, height / 2] });
    doc.opacity(0.08);
    doc.fontSize(28).fillColor('#7c3aed');

    for (let y = -height; y < height * 2; y += 120) {
      for (let x = -width; x < width * 2; x += 260) {
        doc.text(label, x, y);
      }
    }

    doc.opacity(1);
    doc.restore();
  }

  /** Embed a dynamic watermark that identifies the purchased ticket. */
  embed_anti_counterfeit_watermark(doc: PDFKit.PDFDocument, ticketId: string): void {
    this.embedAntiCounterfeitWatermark(doc, ticketId);
  }

  /**
   * Analytics #991 — verifies a ticket's cryptographic signature (the same
   * one embedded as the PDF's visible security code and used by the QR
   * check-in flow), for spot-checking a printed/offline ticket.
   */
  verifyTicketSignature(ticketId: string, signature: string): boolean {
    return this.ticketSigningService.verify(ticketId, signature);
  }

  /** Verify the cryptographic signature embedded in a ticket PDF or QR code. */
  verify_ticket_signature(ticketId: string, signature: string): boolean {
    return this.verifyTicketSignature(ticketId, signature);
  }
}
