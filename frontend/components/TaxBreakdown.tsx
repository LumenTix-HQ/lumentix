'use client';

import { useEffect, useState } from 'react';
import { calculateTicketSalesTax, formatTaxRate, resolveJurisdiction } from '@/lib/tax';
import type { TaxCalculationResult, TaxRule } from '@/types/tax';

interface TaxBreakdownProps {
  eventId: string;
  basePrice: number;
  currency: string;
  /** Called whenever the tax calculation updates — parent can use the total */
  onTaxCalculated?: (result: TaxCalculationResult | null) => void;
}

const COMMON_JURISDICTIONS: { label: string; value: string }[] = [
  { label: 'United States — California (8.75%)', value: 'US-CA' },
  { label: 'United States — New York (8.00%)', value: 'US-NY' },
  { label: 'United States — Texas (6.25%)', value: 'US-TX' },
  { label: 'United States — Florida (6.00%)', value: 'US-FL' },
  { label: 'United States — Washington (10.30%)', value: 'US-WA' },
  { label: 'United States — Oregon (0%)', value: 'US-OR' },
  { label: 'United Kingdom (20%)', value: 'GB' },
  { label: 'Germany (19%)', value: 'DE' },
  { label: 'France (20%)', value: 'FR' },
  { label: 'Australia (10%)', value: 'AU' },
  { label: 'Canada (5%)', value: 'CA' },
  { label: 'Japan (10%)', value: 'JP' },
  { label: 'India (18%)', value: 'IN' },
  { label: 'Brazil (12%)', value: 'BR' },
  { label: 'No tax / other', value: '' },
];

export default function TaxBreakdown({
  eventId,
  basePrice,
  currency,
  onTaxCalculated,
}: TaxBreakdownProps) {
  const [jurisdictionCode, setJurisdictionCode] = useState('');
  const [result, setResult] = useState<TaxCalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jurisdictionCode) {
      setResult(null);
      setError(null);
      onTaxCalculated?.(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    calculateTicketSalesTax({
      eventId,
      basePrice,
      jurisdictionCode,
      currency,
    })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        onTaxCalculated?.(r);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message ?? 'Tax calculation failed');
        setResult(null);
        onTaxCalculated?.(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, basePrice, currency, jurisdictionCode]);

  const fmtPrice = (cents: number) =>
    `${(cents / 100).toFixed(2)} ${currency}`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 text-sm">
      <p className="font-semibold text-white/80">Tax Determination</p>

      {/* Jurisdiction selector */}
      <div className="space-y-1">
        <label
          htmlFor="tax-jurisdiction"
          className="block text-xs text-gray-400"
        >
          Select your billing jurisdiction
        </label>
        <select
          id="tax-jurisdiction"
          value={jurisdictionCode}
          onChange={(e) => setJurisdictionCode(e.target.value)}
          className="w-full rounded-lg bg-white/10 border border-white/15 px-3 py-2
                     text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Tax jurisdiction"
        >
          <option value="">— Select jurisdiction —</option>
          {COMMON_JURISDICTIONS.map((j) => (
            <option key={j.value} value={j.value}>
              {j.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          <span className="animate-spin h-3 w-3 border border-blue-500 border-t-transparent rounded-full" />
          Calculating tax…
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Tax breakdown */}
      {result && !loading && (
        <div className="space-y-1.5 pt-1 border-t border-white/10">
          <div className="flex justify-between text-gray-300">
            <span>Ticket price</span>
            <span>{fmtPrice(result.basePrice)}</span>
          </div>
          <div className="flex justify-between text-yellow-400">
            <span>
              Sales tax ({formatTaxRate(result.effectiveRateBps)} —{' '}
              {result.jurisdictionCode})
            </span>
            <span>+{fmtPrice(result.taxAmount)}</span>
          </div>
          <div className="flex justify-between font-semibold text-white border-t border-white/10 pt-1">
            <span>Total</span>
            <span>{fmtPrice(result.totalPrice)}</span>
          </div>
        </div>
      )}

      {/* No-tax state */}
      {result && result.taxAmount === 0 && !loading && (
        <p className="text-green-400 text-xs">
          No sales tax applies in {result.jurisdictionCode}.
        </p>
      )}
    </div>
  );
}
