import { Test, TestingModule } from '@nestjs/testing';
import { TemplateService } from './template.service';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateService],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
    // Trigger onModuleInit to load templates
    service.onModuleInit();
  });

  it('renders password-reset template with resetUrl', () => {
    const html = service.render('password-reset', {
      resetUrl: 'https://example.com/reset?token=abc123',
    });
    expect(html).toContain('Reset Your Password');
    expect(html).toContain('https://example.com/reset?token=abc123');
    expect(html).toContain('Lumentix');
  });

  it('renders registration-confirmed template with event details', () => {
    const html = service.render('registration-confirmed', {
      userName: 'Alice',
      eventTitle: 'Blockchain Summit',
      eventDate: '2025-09-01',
      eventLocation: 'Lagos',
      ticketId: 'TKT-001',
    });
    expect(html).toContain('Registration Confirmed');
    expect(html).toContain('Alice');
    expect(html).toContain('Blockchain Summit');
    expect(html).toContain('TKT-001');
  });

  it('renders refund-issued template with amount and txHash', () => {
    const html = service.render('refund-issued', {
      userName: 'Bob',
      eventTitle: 'DevFest',
      amount: '50',
      currency: 'XLM',
      transactionHash: 'abc123txhash',
    });
    expect(html).toContain('Refund Issued');
    expect(html).toContain('50');
    expect(html).toContain('XLM');
    expect(html).toContain('abc123txhash');
  });

  it('renders ticket-ready template with optional pdfUrl', () => {
    const html = service.render('ticket-ready', {
      userName: 'Carol',
      eventTitle: 'NestFest',
      ticketId: 'TKT-002',
      eventDate: '2025-10-15',
      pdfUrl: 'https://cdn.example.com/ticket.pdf',
    });
    expect(html).toContain('Your Ticket is Ready');
    expect(html).toContain('TKT-002');
    expect(html).toContain('https://cdn.example.com/ticket.pdf');
  });

  it('renders ticket-ready template without pdfUrl', () => {
    const html = service.render('ticket-ready', {
      userName: 'Dave',
      eventTitle: 'NestFest',
      ticketId: 'TKT-003',
      eventDate: '2025-10-15',
    });
    expect(html).toContain('Your Ticket is Ready');
    expect(html).not.toContain('Download Ticket PDF');
  });

  it('renders event-cancelled template', () => {
    const html = service.render('event-cancelled', {
      userName: 'Eve',
      eventTitle: 'CancelledConf',
    });
    expect(html).toContain('Event Cancelled');
    expect(html).toContain('CancelledConf');
  });

  it('wraps all templates in the base layout with Lumentix branding', () => {
    const html = service.render('password-reset', { resetUrl: '#' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Lumentix');
    expect(html).toContain('Stellar Network');
  });

  it('throws an error for an unknown template name', () => {
    expect(() => service.render('non-existent-template')).toThrow(
      /non-existent-template/,
    );
  });
});
