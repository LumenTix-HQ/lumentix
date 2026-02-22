export class RefundResultDto {
  /** The payment that was (or failed to be) refunded */
  paymentId: string;

  /** Owner of the payment */
  userId: string;

  /** Amount that was refunded (or attempted) */
  amount: number;

  /** Asset code e.g. XLM */
  currency: string;

  /** true if the on-chain transaction succeeded and records were updated */
  success: boolean;

  /** Stellar transaction hash — only present on success */
  transactionHash?: string;

  /** Human-readable failure reason — only present on failure */
  error?: string;
}