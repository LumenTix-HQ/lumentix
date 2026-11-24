import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { TicketPdfService } from './ticket-pdf.service';
import { TicketSigningService } from './ticket-signing.service';

function createMockStream() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
    }),
    trigger: (event: string, ...args: unknown[]) => {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
  };
}

let lastDoc: any;

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const doc: any = {
      page: { width: 420, height: 595 },
      pipe: jest.fn(),
      save: jest.fn().mockReturnThis(),
      restore: jest.fn().mockReturnThis(),
      rotate: jest.fn().mockReturnThis(),
      opacity: jest.fn().mockReturnThis(),
      fontSize: jest.fn().mockReturnThis(),
      fillColor: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      moveDown: jest.fn().mockReturnThis(),
      image: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    (global as any).__lastPdfDoc = doc;
    return doc;
  });
});

jest.mock('fs', () => ({
  promises: { mkdir: jest.fn().mockResolvedValue(undefined) },
  createWriteStream: jest.fn(),
}));

describe('TicketPdfService', () => {
  let service: TicketPdfService;
  let signingService: jest.Mocked<Pick<TicketSigningService, 'sign' | 'verify'>>;
  let mockStream: ReturnType<typeof createMockStream>;

  const ticket = { id: 'ticket-123' } as any;
  const event = { title: 'Launch Party', startDate: new Date(), location: 'The Venue' };
  const qrDataUrl = 'data:image/png;base64,AAAA';

  beforeEach(async () => {
    signingService = {
      sign: jest.fn().mockReturnValue('deadbeef'.repeat(8)),
      verify: jest.fn().mockReturnValue(true),
    };

    mockStream = createMockStream();
    (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketPdfService,
        { provide: TicketSigningService, useValue: signingService },
      ],
    }).compile();

    service = module.get<TicketPdfService>(TicketPdfService);
  });

  async function generateAndResolve() {
    const promise = service.generatePdfTicket(ticket, event, 'attendee@example.com', qrDataUrl);
    // Let the `await fs.promises.mkdir(...)` inside the service resolve and
    // register the stream's 'finish' listener before we fire it — the real
    // stream would emit 'finish' once doc.end() flushes; the mock stream
    // needs a manual nudge.
    await Promise.resolve();
    await Promise.resolve();
    mockStream.trigger('finish');
    return promise;
  }

  it('signs the ticket and embeds the signature as a visible security code', async () => {
    await generateAndResolve();

    expect(signingService.sign).toHaveBeenCalledWith('ticket-123');
    const doc = (global as any).__lastPdfDoc;
    const securityCodeCall = doc.text.mock.calls.find((call: unknown[]) =>
      String(call[0]).startsWith('Security code:'),
    );
    expect(securityCodeCall).toBeDefined();
  });

  // Regression test for #991: the PDF must carry a visible anti-counterfeit
  // watermark, not just event details and a QR code.
  it('draws a rotated, low-opacity watermark before the ticket content', async () => {
    await generateAndResolve();

    const doc = (global as any).__lastPdfDoc;
    expect(doc.rotate).toHaveBeenCalledWith(-35, expect.objectContaining({ origin: expect.any(Array) }));
    expect(doc.opacity).toHaveBeenCalledWith(0.08);
    const watermarkCall = doc.text.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('LUMENTIX · TICKET-1'),
    );
    expect(watermarkCall).toBeDefined();
  });

  it('embeds the QR code image', async () => {
    await generateAndResolve();

    const doc = (global as any).__lastPdfDoc;
    expect(doc.image).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ width: 150 }));
  });

  it('resolves with the ticket PDF URL', async () => {
    const url = await generateAndResolve();
    expect(url).toBe('/tickets/ticket-ticket-123.pdf');
  });

  it('generate_pdf_ticket() creates a downloadable signed PDF ticket', async () => {
    const promise = service.generate_pdf_ticket(ticket, event, 'attendee@example.com', qrDataUrl);
    await Promise.resolve();
    await Promise.resolve();
    mockStream.trigger('finish');

    await expect(promise).resolves.toBe('/tickets/ticket-ticket-123.pdf');
    expect(signingService.sign).toHaveBeenCalledWith('ticket-123');
  });

  it('generate() is an alias for generatePdfTicket()', async () => {
    const promise = service.generate(ticket, event, 'attendee@example.com', qrDataUrl);
    await Promise.resolve();
    await Promise.resolve();
    mockStream.trigger('finish');
    const url = await promise;
    expect(url).toBe('/tickets/ticket-ticket-123.pdf');
    expect(signingService.sign).toHaveBeenCalled();
  });

  describe('verifyTicketSignature (#991)', () => {
    it('delegates to TicketSigningService.verify', () => {
      const result = service.verifyTicketSignature('ticket-123', 'some-signature');

      expect(signingService.verify).toHaveBeenCalledWith('ticket-123', 'some-signature');
      expect(result).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      signingService.verify.mockReturnValue(false);

      expect(service.verifyTicketSignature('ticket-123', 'bad-signature')).toBe(false);
    });

    it('supports the requested snake_case verification name', () => {
      expect(service.verify_ticket_signature('ticket-123', 'some-signature')).toBe(true);
      expect(signingService.verify).toHaveBeenCalledWith('ticket-123', 'some-signature');
    });
  });

  it('supports the requested snake_case watermark name', () => {
    const doc = (global as any).__lastPdfDoc;

    service.embed_anti_counterfeit_watermark(doc, 'ticket-123');

    expect(doc.rotate).toHaveBeenCalledWith(-35, expect.objectContaining({ origin: expect.any(Array) }));
  });
});
