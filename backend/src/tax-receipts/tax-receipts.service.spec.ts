import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { TaxReceiptsService } from './tax-receipts.service';
import { TaxFormat, TaxReceipt, TaxReceiptStatus } from './entities/tax-receipt.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { MailerService } from '../mailer/mailer.service';

const makePayment = (over: Partial<Payment> = {}): Payment =>
  ({
    id: 'pay-001',
    userId: 'user-abc',
    amount: 100,
    currency: 'GBP',
    status: PaymentStatus.CONFIRMED,
    ...over,
  }) as Payment;

const makeReceipt = (over: Partial<TaxReceipt> = {}): TaxReceipt =>
  ({
    id: 'rcpt-001',
    paymentId: 'pay-001',
    userId: 'user-abc',
    countryCode: 'GB',
    taxFormat: TaxFormat.VAT,
    subtotal: 100,
    taxRate: 0.2,
    taxAmount: 20,
    total: 120,
    currency: 'GBP',
    status: TaxReceiptStatus.GENERATED,
    pdfUrl: null,
    receiptData: {},
    emailedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as TaxReceipt;

describe('TaxReceiptsService (#1464)', () => {
  let service: TaxReceiptsService;

  const mockReceiptRepo = {
    findOne: jest.fn(),
    find: jest.fn(() => Promise.resolve([])),
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(async (entity) => ({ ...entity, id: entity.id ?? 'rcpt-001', createdAt: new Date(), updatedAt: new Date() })),
  };
  const mockPaymentRepo = { findOne: jest.fn() };
  const mockUserRepo = {
    findOne: jest.fn(() =>
      Promise.resolve({ id: 'user-abc', email: 'test@example.com' }),
    ),
  };
  const mockMailer = { send: jest.fn(() => Promise.resolve()) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxReceiptsService,
        { provide: getRepositoryToken(TaxReceipt), useValue: mockReceiptRepo },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get(TaxReceiptsService);
  });

  // ── apply_regional_tax_rules ──────────────────────────────────────────────

  describe('apply_regional_tax_rules', () => {
    it('returns 20% VAT for GB', () => {
      const rule = service.applyRegionalTaxRules('GB');
      expect(rule.format).toBe(TaxFormat.VAT);
      expect(rule.rate).toBeCloseTo(0.20);
    });

    it('returns 10% GST for AU', () => {
      const rule = service.applyRegionalTaxRules('AU');
      expect(rule.format).toBe(TaxFormat.GST);
      expect(rule.rate).toBeCloseTo(0.10);
    });

    it('returns state sales-tax rate for US/CA', () => {
      const rule = service.applyRegionalTaxRules('US', 'CA');
      expect(rule.format).toBe(TaxFormat.SALES_TAX);
      expect(rule.rate).toBeCloseTo(0.0725);
    });

    it('returns 0% / NONE for an unknown country', () => {
      const rule = service.applyRegionalTaxRules('XX');
      expect(rule.format).toBe(TaxFormat.NONE);
      expect(rule.rate).toBe(0);
    });

    it('falls back to base US rate when stateCode is not in the map', () => {
      const rule = service.applyRegionalTaxRules('US', 'ZZ');
      expect(rule.format).toBe(TaxFormat.SALES_TAX);
      expect(rule.rate).toBe(0); // base US fallback
    });
  });

  // ── generate_tax_receipt ──────────────────────────────────────────────────

  describe('generate_tax_receipt', () => {
    it('generates a receipt for a confirmed GB payment', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(makePayment());
      mockReceiptRepo.findOne.mockResolvedValue(null);

      const result = await service.generateTaxReceipt('user-abc', {
        paymentId: 'pay-001',
        countryCode: 'GB',
      });

      expect(result.taxFormat).toBe(TaxFormat.VAT);
      expect(result.taxRate).toBeCloseTo(0.20);
      expect(result.taxAmount).toBeCloseTo(20);
      expect(result.total).toBeCloseTo(120);
      expect(result.status).toBe(TaxReceiptStatus.GENERATED);
    });

    it('rejects when payment is not found', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);
      await expect(
        service.generateTaxReceipt('user-abc', {
          paymentId: 'missing',
          countryCode: 'GB',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when payment belongs to a different user', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(
        makePayment({ userId: 'other-user' }),
      );
      await expect(
        service.generateTaxReceipt('user-abc', {
          paymentId: 'pay-001',
          countryCode: 'GB',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when payment is not confirmed', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(
        makePayment({ status: PaymentStatus.PENDING }),
      );
      await expect(
        service.generateTaxReceipt('user-abc', {
          paymentId: 'pay-001',
          countryCode: 'GB',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the existing receipt without re-generating when one already exists', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(makePayment());
      mockReceiptRepo.findOne.mockResolvedValue(makeReceipt());

      const result = await service.generateTaxReceipt('user-abc', {
        paymentId: 'pay-001',
        countryCode: 'GB',
      });

      expect(result.id).toBe('rcpt-001');
      // save should NOT be called for an already-generated receipt
      expect(mockReceiptRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── email_tax_receipt ─────────────────────────────────────────────────────

  describe('email_tax_receipt', () => {
    it('sends the receipt PDF and marks status as EMAILED', async () => {
      mockReceiptRepo.findOne.mockResolvedValue(makeReceipt());
      mockReceiptRepo.save.mockImplementation(async (e) => ({
        ...e,
        updatedAt: new Date(),
      }));

      const result = await service.emailTaxReceipt(
        'rcpt-001',
        'test@example.com',
      );

      expect(mockMailer.send).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(TaxReceiptStatus.EMAILED);
      expect(result.emailedAt).not.toBeNull();
    });

    it('rejects when receipt is not found', async () => {
      mockReceiptRepo.findOne.mockResolvedValue(null);
      await expect(
        service.emailTaxReceipt('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the receipt PDF has not been generated yet', async () => {
      mockReceiptRepo.findOne.mockResolvedValue(
        makeReceipt({ status: TaxReceiptStatus.PENDING }),
      );
      await expect(
        service.emailTaxReceipt('rcpt-001', 'test@example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
