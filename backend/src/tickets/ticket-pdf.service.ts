import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { TicketEntity } from './entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class TicketPdfService {
  async generate(
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
}
