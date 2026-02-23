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

const mockSponsorsService = {
  confirmSponsorPayment: jest.fn(),
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

      expect(mockPaymentsService.confirmPayment).toHaveBeenCalledWith('tx-abc');
    });

    it('falls through to sponsor confirmation when no payment matches', async () => {
      mockPaymentsService.confirmPayment.mockRejectedValue(
        Object.assign(new NotFoundException(), { status: 404 }),
      );
      mockSponsorsService.confirmSponsorPayment.mockResolvedValue({});

      await service.handlePayment(
        makePayment({ transaction_hash: 'tx-sponsor' }),
      );

      expect(mockSponsorsService.confirmSponsorPayment).toHaveBeenCalledWith(
        'tx-sponsor',
      );
    });

    it('skips non-payment operation types', async () => {
      await service.handlePayment(makePayment({ type: 'set_options' as any }));

      expect(mockPaymentsService.confirmPayment).not.toHaveBeenCalled();
      expect(mockSponsorsService.confirmSponsorPayment).not.toHaveBeenCalled();
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
      mockSponsorsService.confirmSponsorPayment.mockRejectedValue(
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

      expect(mockPaymentsService.confirmPayment).toHaveBeenCalledWith(
        'tx-create',
      );
    });
  });

  // ── Reconnection ────────────────────────────────────────────────────────

  describe('reconnection', () => {
    it('schedules a reconnect when stream open throws', () => {
      jest.useFakeTimers();

      mockStellarService.streamPayments
        .mockImplementationOnce(() => {
          throw new Error('connection refused');
        })
        .mockReturnValue(mockStreamCloser);

      service.onModuleInit();

      // Should have tried once and failed
      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(1);

      // After delay, should reconnect
      jest.advanceTimersByTime(6_000);
      expect(mockStellarService.streamPayments).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });
});
