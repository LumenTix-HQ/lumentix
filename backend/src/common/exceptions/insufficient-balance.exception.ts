import { BadRequestException } from '@nestjs/common';

export class InsufficientBalanceException extends BadRequestException {
  readonly currentBalance: string;
  readonly requiredBalance: string;

  constructor(currentBalance: string, requiredBalance: string) {
    super(
      `Insufficient platform balance. Current: ${currentBalance} XLM, Required: ${requiredBalance} XLM`,
    );
    this.currentBalance = currentBalance;
    this.requiredBalance = requiredBalance;
  }
}
