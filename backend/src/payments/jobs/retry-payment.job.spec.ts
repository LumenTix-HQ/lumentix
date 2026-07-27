import { RetryPaymentJob } from './retry-payment.job';
import { PaymentStatus } from '../entities/payment.entity';
import { AuditAction } from '../../audit/entities/audit-log.entity';

describe('RetryPaymentJob (#449 timeout-then-retry path)', () => {
  let paymentsRepository: { findOne: jest.Mock; save: jest.Mock };
  let stellarService: { submitTransaction: jest.Mock };
  let auditService: { log: jest.Mock };
  let job: RetryPaymentJob;

  const PENDING_PAYMENT = {
    id: 'payment-1',
    userId: 'user-1',
    status: PaymentStatus.PENDING,
    signedXdr: 'AAAA...signed-xdr...',
    transactionHash: null,
  };

  beforeEach(() => {
    paymentsRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    stellarService = { submitTransaction: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    job = new RetryPaymentJob(
      paymentsRepository as any,
      stellarService as any,
      auditService as any,
    );
  });

  describe('handle', () => {
    it('resubmits the persisted signedXdr and confirms the payment on success', async () => {
      paymentsRepository.findOne.mockResolvedValue({ ...PENDING_PAYMENT });
      stellarService.submitTransaction.mockResolvedValue({ hash: 'retry-tx-hash' });

      await job.handle({
        data: { paymentId: 'payment-1' },
        attemptsMade: 1,
      } as any);

      expect(stellarService.submitTransaction).toHaveBeenCalledWith(PENDING_PAYMENT.signedXdr);
      const saved = paymentsRepository.save.mock.calls[0][0];
      expect(saved.status).toBe(PaymentStatus.CONFIRMED);
      expect(saved.transactionHash).toBe('retry-tx-hash');
      expect(saved.signedXdr).toBeNull();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.PAYMENT_CONFIRMED, resourceId: 'payment-1' }),
      );
    });

    it('does nothing if the payment is no longer PENDING (resolved via another path)', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        ...PENDING_PAYMENT,
        status: PaymentStatus.CONFIRMED,
      });

      await job.handle({ data: { paymentId: 'payment-1' }, attemptsMade: 0 } as any);

      expect(stellarService.submitTransaction).not.toHaveBeenCalled();
      expect(paymentsRepository.save).not.toHaveBeenCalled();
    });

    it('does nothing if there is no signedXdr to retry', async () => {
      paymentsRepository.findOne.mockResolvedValue({ ...PENDING_PAYMENT, signedXdr: null });

      await job.handle({ data: { paymentId: 'payment-1' }, attemptsMade: 0 } as any);

      expect(stellarService.submitTransaction).not.toHaveBeenCalled();
    });

    it('propagates the error when resubmission fails, so Bull retries again', async () => {
      paymentsRepository.findOne.mockResolvedValue({ ...PENDING_PAYMENT });
      stellarService.submitTransaction.mockRejectedValue(new Error('still timing out'));

      await expect(
        job.handle({ data: { paymentId: 'payment-1' }, attemptsMade: 1 } as any),
      ).rejects.toThrow('still timing out');

      expect(paymentsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('handleFailed', () => {
    it('marks the payment FAILED and clears signedXdr once all attempts are exhausted', async () => {
      paymentsRepository.findOne.mockResolvedValue({ ...PENDING_PAYMENT });

      await job.handleFailed(
        {
          name: 'retry',
          data: { paymentId: 'payment-1' },
          attemptsMade: 3,
          opts: { attempts: 3 },
        } as any,
        new Error('still timing out'),
      );

      const saved = paymentsRepository.save.mock.calls[0][0];
      expect(saved.status).toBe(PaymentStatus.FAILED);
      expect(saved.signedXdr).toBeNull();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.PAYMENT_FAILED, resourceId: 'payment-1' }),
      );
    });

    it('does not mark the payment failed if more attempts remain', async () => {
      paymentsRepository.findOne.mockResolvedValue({ ...PENDING_PAYMENT });

      await job.handleFailed(
        {
          name: 'retry',
          data: { paymentId: 'payment-1' },
          attemptsMade: 1,
          opts: { attempts: 3 },
        } as any,
        new Error('still timing out'),
      );

      expect(paymentsRepository.save).not.toHaveBeenCalled();
    });

    it('ignores failures from jobs of a different name in the same queue', async () => {
      await job.handleFailed(
        {
          name: 'some-other-job',
          data: { paymentId: 'payment-1' },
          attemptsMade: 3,
          opts: { attempts: 3 },
        } as any,
        new Error('unrelated'),
      );

      expect(paymentsRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
