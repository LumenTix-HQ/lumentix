import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StellarWebhookService } from './stellar-webhook.service';
import { Horizon } from '@stellar/stellar-sdk';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockStreamCloser = jest.fn();

const mockStellarService = {
  streamPayments: jest.fn().mockReturnValue(mockStreamCloser),
};

const mockPaymentsService = {
  confirmPayment: jest.fn(),
};

const mockSponsorsService = {};

const mockContributionsService = {
  confirmContribution: jest.fn(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayment(
  overrides: Partial<Horizon.ServerApi.PaymentOperationRecord> = {},
): Horizon.ServerApi.PaymentOperationRecord {
  return {
    id: 'op-1',
    type: 'payment',
    transaction_hash: 'tx-hash-abc',
    ...overrides,
  } as unknown as Horizon.ServerApi.PaymentOperationRecord;
}

function buildService(): StellarWebhookService {
  return new StellarWebhookService(
    mockStellarService as any,
    mockPaymentsService as any,
    mockSponsorsService as any,
    mockContributionsService as any,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StellarWebhookService', () => {
  let service: StellarWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  // ── Streaming setup ─────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('opens a payment stream on init', () => {
      service.onModuleInit();
      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(1);
    });

    it('passes a callback to streamPayments', () => {
      service.onModuleInit();
      const [callback] = mockStellarService.streamPayments.mock.calls[0];
      expect(typeof callback).toBe('function');
    });
  });

  describe('onModuleDestroy', () => {
    it('closes the stream on destroy', () => {
      service.onModuleInit();
      service.onModuleDestroy();
      expect(mockStreamCloser).toHaveBeenCalledTimes(1);
    });

    it('does not attempt reconnect after destroy', () => {
      jest.useFakeTimers();
      service.onModuleInit();
      service.onModuleDestroy();
      jest.runAllTimers();
      // streamPayments should only have been called once (on init)
      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  // ── handlePayment ───────────────────────────────────────────────────────

  describe('handlePayment', () => {
    it('confirms a matched pending payment', async () => {
      mockPaymentsService.confirmPayment.mockResolvedValue({ id: 'payment-1' });

      await service.handlePayment(makePayment({ transaction_hash: 'tx-abc' }));

      expect(mockPaymentsService.confirmPayment).toHaveBeenCalledWith('tx-abc', 'system');
    });

    it('falls through to sponsor confirmation when no payment matches', async () => {
      mockPaymentsService.confirmPayment.mockRejectedValue(
        Object.assign(new NotFoundException(), { status: 404 }),
      );
      mockContributionsService.confirmContribution.mockResolvedValue({});

      await service.handlePayment(
        makePayment({ transaction_hash: 'tx-sponsor' }),
      );

      expect(mockContributionsService.confirmContribution).toHaveBeenCalledWith(
        'tx-sponsor',
      );
    });

    it('skips non-payment operation types', async () => {
      await service.handlePayment(makePayment({ type: 'set_options' as any }));

      expect(mockPaymentsService.confirmPayment).not.toHaveBeenCalled();
      expect(mockContributionsService.confirmContribution).not.toHaveBeenCalled();
    });

    it('skips payment records with no transaction_hash', async () => {
      await service.handlePayment(
        makePayment({ transaction_hash: undefined as any }),
      );

      expect(mockPaymentsService.confirmPayment).not.toHaveBeenCalled();
    });

    it('does not crash the stream on unexpected payment error', async () => {
      mockPaymentsService.confirmPayment.mockRejectedValue(
        new Error('unexpected db error'),
      );

      await expect(service.handlePayment(makePayment())).resolves.not.toThrow();
    });

    it('does not crash the stream on unexpected sponsor error', async () => {
      mockPaymentsService.confirmPayment.mockRejectedValue(
        Object.assign(new NotFoundException(), { status: 404 }),
      );
      mockContributionsService.confirmContribution.mockRejectedValue(
        new Error('unexpected sponsor error'),
      );

      await expect(service.handlePayment(makePayment())).resolves.not.toThrow();
    });

    it('handles create_account operation type', async () => {
      mockPaymentsService.confirmPayment.mockResolvedValue({});

      await service.handlePayment(
        makePayment({
          type: 'create_account' as any,
          transaction_hash: 'tx-create',
        }),
      );

      expect(mockPaymentsService.confirmPayment).toHaveBeenCalledWith('tx-create', 'system');
    });
  });

  // ── Reconnection ────────────────────────────────────────────────────────

    it('uses exponential backoff for reconnection attempts', () => {
      jest.useFakeTimers();

      // First 10 attempts should fail
      for (let i = 0; i < 10; i++) {
        mockStellarService.streamPayments.mockImplementationOnce(() => {
          throw new Error('connection refused');
        });
      }
      mockStellarService.streamPayments.mockReturnValue(mockStreamCloser);

      service.onModuleInit();
      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(1);

      // 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s
      const expectedDelays = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000];

      for (let i = 0; i < expectedDelays.length; i++) {
        jest.advanceTimersByTime(expectedDelays[i] + 100);
        expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(i + 2);
      }

      jest.useRealTimers();
    });

    it('emits STELLAR_STREAM_DEAD after 10 failures and stops retrying', () => {
      jest.useFakeTimers();
      const notificationService = (service as any).notificationService;

      // All attempts fail
      mockStellarService.streamPayments.mockImplementation(() => {
        throw new Error('connection refused');
      });

      service.onModuleInit();

      // Run through 10 failures
      for (let i = 0; i < 10; i++) {
        jest.runOnlyPendingTimers();
      }

      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(10);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'STELLAR_STREAM_DEAD',
        { attempts: 10 },
      );

      // After 10, should not try again
      jest.runOnlyPendingTimers();
      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(10);

      jest.useRealTimers();
    });

    it('resets reconnect counter on successful connection', () => {
      jest.useFakeTimers();

      // Fail first 2 times
      mockStellarService.streamPayments
        .mockImplementationOnce(() => {
          throw new Error('connection refused');
        })
        .mockImplementationOnce(() => {
          throw new Error('connection refused');
        })
        .mockReturnValue(mockStreamCloser);

      service.onModuleInit();
      expect(service.reconnectAttempts).toBe(1);

      jest.advanceTimersByTime(1_100);
      expect(service.reconnectAttempts).toBe(2);

      jest.advanceTimersByTime(2_100);
      // 3rd attempt is successful
      expect(service.reconnectAttempts).toBe(0);

      jest.useRealTimers();
    });

    it('reconnect() resets counters and triggers immediate reconnect', () => {
      jest.useFakeTimers();

      // Initial connection fails
      mockStellarService.streamPayments.mockImplementationOnce(() => {
        throw new Error('connection refused');
      });

      service.onModuleInit();
      expect(service.reconnectAttempts).toBe(1);

      // Manual reconnect
      service.reconnect();

      expect(service.reconnectAttempts).toBe(0);
      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });
});