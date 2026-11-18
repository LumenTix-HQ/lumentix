import { RefundPolicyService } from './refund-policy.service';
import { CancellationReason } from '../enums';

describe('RefundPolicyService', () => {
  let service: RefundPolicyService;
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000);

  beforeEach(() => {
    service = new RefundPolicyService();
  });

  const base = {
    paymentAmount: 100,
    currency: 'XLM',
    paymentCreatedAt: hoursFromNow(-10),
    eventStartDate: hoursFromNow(200),
  };

  it('fully refunds a force majeure cancellation', () => {
    const result = service.calculateRefundAmount({
      ...base,
      cancellationReason: CancellationReason.FORCE_MAJEURE,
    });
    expect(result.refundPercentage).toBe(100);
    expect(result.refundAmount).toBe(100);
  });

  it('never refunds more than was paid or a negative amount', () => {
    for (const reason of Object.values(CancellationReason)) {
      const result = service.calculateRefundAmount({
        ...base,
        cancellationReason: reason,
      });
      expect(result.refundAmount).toBeGreaterThanOrEqual(0);
      expect(result.refundAmount).toBeLessThanOrEqual(100);
    }
  });

  it('honours an explicit full-refund preference', () => {
    const result = service.calculateRefundAmount({
      ...base,
      cancellationReason: CancellationReason.FORCE_MAJEURE,
      userRefundPreference: 'full',
    });
    expect(result.refundPercentage).toBe(100);
    expect(result.deductionAmount).toBe(0);
  });

  describe('isRefundEligible', () => {
    it('always allows automatic-refund reasons', () => {
      expect(
        service.isRefundEligible(
          base.paymentCreatedAt,
          hoursFromNow(1),
          CancellationReason.VENUE_UNAVAILABLE,
        ).eligible,
      ).toBe(true);
    });
  });
});
