/**
 * Tax determination API client.
 *
 * Wraps the /tax backend endpoints.  All functions are tree-shakeable
 * and can be imported individually where needed.
 */

import { apiGet, apiPost } from '@/lib/api-client';
import type {
  CalculateTaxPayload,
  RecordTaxCollectionPayload,
  TaxCalculationResult,
  TaxCollectionRecord,
  TaxReport,
  TaxRule,
} from '@/types/tax';

// ── Tax Rules ─────────────────────────────────────────────────────────────────

/**
 * Fetch all active tax rules from the backend.
 * Used to populate jurisdiction dropdowns at checkout.
 */
export async function listTaxRules(): Promise<TaxRule[]> {
  return apiGet<TaxRule[]>('/tax/rules');
}

/**
 * Look up the tax rule for a specific jurisdiction code.
 */
export async function getTaxRule(jurisdictionCode: string): Promise<TaxRule> {
  return apiGet<TaxRule>(`/tax/rules/${encodeURIComponent(jurisdictionCode)}`);
}

// ── Tax Calculation ───────────────────────────────────────────────────────────

/**
 * Calculate the applicable sales tax for a ticket purchase.
 *
 * This is a read-only operation — nothing is persisted.
 * Call `recordTaxCollection` after a successful purchase to create a receipt.
 *
 * @example
 * const result = await calculateTicketSalesTax({
 *   eventId: 'evt-123',
 *   basePrice: 5000,       // $50.00 in cents
 *   jurisdictionCode: 'US-CA',
 *   currency: 'USD',
 * });
 * // result.taxAmount  → 437  (8.75% of 5000)
 * // result.totalPrice → 5437
 */
export async function calculateTicketSalesTax(
  payload: CalculateTaxPayload,
): Promise<TaxCalculationResult> {
  return apiPost<TaxCalculationResult>('/tax/calculate', payload);
}

// ── Tax Collection Recording ──────────────────────────────────────────────────

/**
 * Record a tax collection event after a ticket has been successfully purchased.
 * Creates an immutable receipt that feeds into tax reports.
 */
export async function recordTaxCollection(
  payload: RecordTaxCollectionPayload,
  basePrice: number,
): Promise<TaxCollectionRecord> {
  return apiPost<TaxCollectionRecord>(
    `/tax/collect?basePrice=${encodeURIComponent(basePrice)}`,
    payload,
  );
}

// ── Jurisdiction Resolution ───────────────────────────────────────────────────

/**
 * Resolve the best-matching tax jurisdiction for a country/state pair.
 * Returns `null` if no rule is configured.
 */
export async function resolveJurisdiction(
  countryCode: string,
  stateCode?: string,
): Promise<TaxRule | null> {
  const params = new URLSearchParams({ countryCode });
  if (stateCode) params.set('stateCode', stateCode);
  try {
    return await apiGet<TaxRule>(`/tax/resolve?${params.toString()}`);
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format a basis-points rate as a human-readable percentage string.
 * e.g. 875 → "8.75%"
 */
export function formatTaxRate(rateBps: number): string {
  const pct = rateBps / 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)}%`;
}

/**
 * Compute the tax breakdown for a price+rate without making an API call.
 * Useful for optimistic UI updates.
 */
export function computeTaxLocally(
  basePrice: number,
  rateBps: number,
): { taxAmount: number; totalPrice: number } {
  const taxAmount = Math.floor((basePrice * rateBps) / 10_000);
  return { taxAmount, totalPrice: basePrice + taxAmount };
}
