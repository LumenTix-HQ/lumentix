import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  RefundCalculatorService,
  RefundPolicy,
} from './refund-calculator.service';

describe('RefundCalculatorService', () => {
  let service: RefundCalculatorService;

  const POLICY_DEFAULTS: RefundPolicy = {
    fullRefundWindowHours: 48,
    partialRefundRate: 0.5,
    refundCutoffHours: 24,
  };

  function buildService(configOverrides: Partial<Record<string, number>> = {}) {
    const config = {
      FULL_REFUND_WINDOW_HOURS: POLICY_DEFAULTS.fullRefundWindowHours,
      PARTIAL_REFUND_RATE: POLICY_DEFAULTS.partialRefundRate,
      REFUND_CUTOFF_HOURS: POLICY_DEFAULTS.refundCutoffHours,
      ...configOverrides,
    };

    return new RefundCalculatorService({
      get: (key: string, defaultValue?: number) => config[key] ?? defaultValue,
    } as ConfigService);
  }

  beforeEach(() => {
    service = buildService();
  });

  // ─── Full refund window ───────────────────────────────────────────────────

  describe('calculateRefundAmount — full refund window', () => {
    it('returns 100% refund when hoursSincePurchase is 0', () => {
      const result = service.calculateRefundAmount(0, 100);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(100);
    });

    it('returns 100% refund at the boundary of the full refund window', () => {
      const result = service.calculateRefundAmount(48, 100);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(100);
    });

    it('returns 100% refund for a small number of hours', () => {
      const result = service.calculateRefundAmount(12, 250);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(250);
    });
  });

  // ─── Partial refund window ────────────────────────────────────────────────
  //
  // Defaults: FULL_REFUND_WINDOW=48, REFUND_CUTOFF=24
  // With these defaults, full refund window (48) > cutoff (24) so the partial
  // zone is empty.  To exercise partial refunds we must set
  // FULL_REFUND_WINDOW_HOURS < REFUND_CUTOFF_HOURS.

  describe('calculateRefundAmount — partial refund window', () => {
    beforeEach(() => {
      // full=12, cutoff=48 → partial zone is 12–48
      service = buildService({
        FULL_REFUND_WINDOW_HOURS: 12,
        REFUND_CUTOFF_HOURS: 48,
        PARTIAL_REFUND_RATE: 0.5,
      });
    });

    it('returns partial refund just past the full window', () => {
      // 20h > 12h (full window), 20h < 48h (cutoff) → partial
      const result = service.calculateRefundAmount(20, 100);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(50); // 100 * 0.5
    });

    it('returns partial refund at the cutoff boundary', () => {
      // 48h is ≤ cutoff, so still in partial zone
      const result = service.calculateRefundAmount(48, 200);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(100); // 200 * 0.5
    });

    it('uses custom partial refund rate from env', () => {
      service = buildService({
        FULL_REFUND_WINDOW_HOURS: 12,
        REFUND_CUTOFF_HOURS: 48,
        PARTIAL_REFUND_RATE: 0.75,
      });
      const result = service.calculateRefundAmount(20, 100);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(75); // 100 * 0.75
    });

    it('rounds partial amounts to 7 decimal places', () => {
      const result = service.calculateRefundAmount(20, 3);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(1.5); // 3 * 0.5
    });

    it('returns not eligible when past cutoff even with partial zone active', () => {
      const result = service.calculateRefundAmount(49, 100);
      expect(result.eligible).toBe(false);
      expect(result.refundAmount).toBe(0);
    });
  });

  // ─── No refund (cutoff passed) ────────────────────────────────────────────

  describe('calculateRefundAmount — cutoff passed', () => {
    beforeEach(() => {
      // Defaults: full=48, cutoff=24. Since 48 > 24 the partial zone is empty
      // and the effective cutoff is 48 hours.
      service = buildService({
        FULL_REFUND_WINDOW_HOURS: 48,
        REFUND_CUTOFF_HOURS: 24,
      });
    });

    it('returns not eligible just past the full window hours (defaults)', () => {
      // Full window is 48, cutoff is 24. Since 48 > 24, partial zone is empty
      // so 49h means past both — not eligible.
      const result = service.calculateRefundAmount(49, 100);
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/refund window closed/i);
      expect(result.refundAmount).toBe(0);
    });

    it('returns not eligible for very old purchases', () => {
      const result = service.calculateRefundAmount(720, 500);
      expect(result.eligible).toBe(false);
      expect(result.refundAmount).toBe(0);
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe('calculateRefundAmount — edge cases', () => {
    it('returns not eligible for negative hours', () => {
      const result = service.calculateRefundAmount(-1, 100);
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/invalid/i);
    });

    it('returns not eligible for zero payment', () => {
      const result = service.calculateRefundAmount(10, 0);
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/invalid payment amount/i);
    });

    it('returns not eligible for negative payment', () => {
      const result = service.calculateRefundAmount(10, -50);
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/invalid payment amount/i);
    });

    it('returns not eligible for NaN hours', () => {
      const result = service.calculateRefundAmount(NaN, 100);
      expect(result.eligible).toBe(false);
    });

    it('returns not eligible for NaN payment', () => {
      const result = service.calculateRefundAmount(10, NaN);
      expect(result.eligible).toBe(false);
    });
  });

  // ─── Event proximity ─────────────────────────────────────────────────────

  describe('calculateRefundByEventProximity', () => {
    it('returns eligible when event is far enough away', () => {
      const result = service.calculateRefundByEventProximity(48, 100);
      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBe(100);
    });

    it('returns not eligible when event is within cutoff', () => {
      const result = service.calculateRefundByEventProximity(12, 100);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Too close to event start');
    });

    it('returns not eligible for NaN hours', () => {
      const result = service.calculateRefundByEventProximity(NaN, 100);
      expect(result.eligible).toBe(false);
    });
  });

  // ─── Custom env vars ─────────────────────────────────────────────────────

  describe('custom env vars', () => {
    it('uses custom FULL_REFUND_WINDOW_HOURS', () => {
      // full=72, cutoff=24. Since 72 > 24, partial zone empty.
      // Full refund for ≤72, nothing after.
      service = buildService({ FULL_REFUND_WINDOW_HOURS: 72 });
      expect(service.calculateRefundAmount(60, 100).refundAmount).toBe(100);
      expect(service.calculateRefundAmount(73, 100).eligible).toBe(false);
    });

    it('uses custom REFUND_CUTOFF_HOURS with partial zone', () => {
      // full=12, cutoff=48 → partial zone 12–48
      service = buildService({
        FULL_REFUND_WINDOW_HOURS: 12,
        REFUND_CUTOFF_HOURS: 48,
      });
      // 20h > 12h, 20h ≤ 48h → partial refund
      expect(service.calculateRefundAmount(20, 100).refundAmount).toBe(50);
      expect(service.calculateRefundAmount(20, 100).eligible).toBe(true);
    });

    it('getPolicy returns current policy values', () => {
      service = buildService({
        FULL_REFUND_WINDOW_HOURS: 24,
        PARTIAL_REFUND_RATE: 0.8,
        REFUND_CUTOFF_HOURS: 12,
      });

      const policy = service.getPolicy();
      expect(policy.fullRefundWindowHours).toBe(24);
      expect(policy.partialRefundRate).toBe(0.8);
      expect(policy.refundCutoffHours).toBe(12);
    });
  });
});
