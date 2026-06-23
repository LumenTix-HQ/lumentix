export interface CurrencyRateResponse {
  base: 'XLM';

  timestamp: string;

  rates: Record<string, number>;
}