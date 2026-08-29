export type TaxJurisdictionType = 'us_state' | 'country' | 'municipal';

export interface TaxRule {
  id: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionType: TaxJurisdictionType;
  rateBps: number;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface TaxCalculationResult {
  eventId: string;
  basePrice: number;
  taxAmount: number;
  totalPrice: number;
  effectiveRateBps: number;
  jurisdictionCode: string;
  currency: string;
  calculatedAt: string;
}

export interface TaxCollectionRecord {
  id: string;
  onChainRecordId: number | null;
  ticketId: string;
  eventId: string;
  purchaserAddress: string;
  taxAmount: number;
  currency: string;
  jurisdictionCode: string;
  collectedAt: string;
  remitted: boolean;
  createdAt: string;
}

export interface TaxReport {
  id: string;
  onChainReportId: number | null;
  jurisdictionCode: string;
  recordCount: number;
  totalTaxCollected: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  exportedBy: string;
  generatedAt: string;
}

/** Payload to calculate tax before checkout */
export interface CalculateTaxPayload {
  eventId: string;
  basePrice: number;
  jurisdictionCode: string;
  currency?: string;
}

/** Payload to record tax after a successful ticket purchase */
export interface RecordTaxCollectionPayload {
  ticketId: string;
  eventId: string;
  purchaserAddress: string;
  jurisdictionCode: string;
  currency?: string;
}
