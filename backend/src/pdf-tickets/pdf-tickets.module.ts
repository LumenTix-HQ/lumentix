import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PdfTicketsService } from './pdf-tickets.service';
import { PdfTicketsController } from './pdf-tickets.controller';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { TicketsModule } from '../tickets/tickets.module';

/**
 * Issue #1544 — PDF Ticket Generation
 *
 * Exposes:
 *  - generate_pdf_ticket    POST /pdf-tickets/:ticketId/generate
 *  - embed_anti_counterfeit_watermark  (service helper, consumed by other modules)
 *  - verify_ticket_signature  POST /pdf-tickets/verify-signature
 *
 * Delegates PDF rendering to `TicketPdfService` and signing to
 * `TicketSigningService`, both exported from `TicketsModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TicketEntity, Event, User]),
    TicketsModule,
  ],
  controllers: [PdfTicketsController],
  providers: [PdfTicketsService],
  exports: [PdfTicketsService],
})
export class PdfTicketsModule {}
