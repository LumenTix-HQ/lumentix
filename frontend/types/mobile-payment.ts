export enum MobileWalletType {
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  SAMSUNG_PAY = 'samsung_pay',
}

export enum MobilePaymentStatus {
  INITIATED = 'initiated',
  AUTHORIZED = 'authorized',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export interface ProcessMobilePaymentDto {
  eventId: string;
  walletType: MobileWalletType;
  walletToken: string;
  amount: number;
  currency?: string;
  walletCredentials?: string;
}

export interface MobilePaymentResponse {
  paymentId: string;
  status: MobilePaymentStatus;
  walletType: MobileWalletType;
  amount: number;
  currency: string;
  transactionHash?: string;
  gatewayReference?: string;
  metadata?: Record<string, unknown>;
}

export interface HandleCallbackDto {
  gatewayReference: string;
  status: string;
  transactionHash?: string;
  gatewayResponse?: Record<string, unknown>;
}
