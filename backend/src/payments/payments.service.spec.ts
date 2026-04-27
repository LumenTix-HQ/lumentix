import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { EventStatus } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { NotificationService } from '../notifications/notification.service';
import { StellarService } from '../stellar/stellar.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let currenciesService: { findActiveCodes: jest.Mock };
  let eventsService: { getEventById: jest.Mock };
  let stellarService: { getTransaction: jest.Mock; extractAndValidateMemo: jest.Mock };
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    paymentsRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value: Partial<Payment>) => value),
      save: jest.fn(async (value: Partial<Payment>) => ({
        id: value.id ?? 'pay-123',
        eventId: value.eventId ?? 'event-123',
        userId: value.userId ?? 'user-123',
        amount: value.amount ?? 100,
        currency: value.currency ?? 'XLM',
        status: value.status ?? PaymentStatus.PENDING,
        expiresAt: value.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
        transactionHash: value.transactionHash ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      createQueryBuilder: jest.fn(),
    };

    currenciesService = {
      findActiveCodes: jest.fn().mockResolvedValue(['XLM', 'USDC']),
    };

    eventsService = {
      getEventById: jest.fn().mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        ticketPrice: 100,
        currency: 'XLM',
        escrowPublicKey: 'GESCROW123',
      }),
    };

    stellarService = {
      getTransaction: jest.fn(),
      extractAndValidateMemo: jest.fn(),
    };

    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(Payment),
          useValue: paymentsRepository,
        },
        {
          provide: CurrenciesService,
          useValue: currenciesService,
        },
        {
          provide: EventsService,
          useValue: eventsService,
        },
        {
          provide: StellarService,
          useValue: stellarService,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
        {
          provide: NotificationService,
          useValue: { queuePaymentFailedEmail: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { fetch?: typeof fetch }).fetch;
  });

  describe('createPaymentIntent', () => {
    it('succeeds when a supported currency is provided', async () => {
      const result = await service.createPaymentIntent(
        'event-123',
        'user-123',
        'usdc',
      );

      expect(currenciesService.findActiveCodes).toHaveBeenCalled();
      expect(paymentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USDC',
        }),
      );
      expect(result.currency).toBe('USDC');
    });

    it('throws when an unsupported currency is provided', async () => {
      await expect(
        service.createPaymentIntent('event-123', 'user-123', 'btc'),
      ).rejects.toThrow(
        new BadRequestException(
          'Currency "BTC" is not supported. Supported: XLM, USDC',
        ),
      );
    });

    it('defaults to the event currency when none is provided', async () => {
      eventsService.getEventById.mockResolvedValueOnce({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        ticketPrice: 100,
        currency: 'XLM',
        escrowPublicKey: 'GESCROW123',
      });

      const result = await service.createPaymentIntent('event-123', 'user-123');

      expect(paymentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'XLM',
        }),
      );
      expect(result.currency).toBe('XLM');
    });
  });

  describe('confirmPayment', () => {
    const dto: ConfirmPaymentDto = {
      transactionHash: 'tx-hash-123',
    };

    it('fails when the on-chain asset does not match payment.currency', async () => {
      stellarService.getTransaction.mockResolvedValue({
        memo: 'pay-123',
        _links: { operations: { href: 'https://horizon.test/ops' } },
      });
      stellarService.extractAndValidateMemo.mockReturnValue('pay-123');
      paymentsRepository.findOne.mockResolvedValue({
        id: 'pay-123',
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
        status: PaymentStatus.PENDING,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          _embedded: {
            records: [
              {
                type: 'payment',
                to: 'GESCROW123',
                amount: '100',
                asset_type: 'native',
              },
            ],
          },
        }),
      }) as unknown as typeof fetch;

      await expect(service.confirmPayment(dto, 'user-123')).rejects.toThrow(
        new BadRequestException('Payment asset does not match expected currency'),
      );
    });

    it('succeeds when the on-chain asset matches payment.currency', async () => {
      stellarService.getTransaction.mockResolvedValue({
        memo: 'pay-123',
        _links: { operations: { href: 'https://horizon.test/ops' } },
      });
      stellarService.extractAndValidateMemo.mockReturnValue('pay-123');
      paymentsRepository.findOne.mockResolvedValue({
        id: 'pay-123',
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
        status: PaymentStatus.PENDING,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        transactionHash: null,
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          _embedded: {
            records: [
              {
                type: 'payment',
                to: 'GESCROW123',
                amount: '100',
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
              },
            ],
          },
        }),
      }) as unknown as typeof fetch;

      const result = await service.confirmPayment(dto, 'user-123');

      expect(result.status).toBe(PaymentStatus.CONFIRMED);
      expect(result.transactionHash).toBe('tx-hash-123');
      expect(paymentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pay-123',
          status: PaymentStatus.CONFIRMED,
          transactionHash: 'tx-hash-123',
        }),
      );
    });
  });
});
