import { TicketEntity } from '../entities/ticket.entity';

export class IssueTicketResponseDto {
  ticket: TicketEntity;
  signature: string;
  qrCodeDataUrl: string;
  pdfUrl: string | null;
  ownerId: string;
  assetCode: string;
  status: string;
  transactionHash: string;
}
