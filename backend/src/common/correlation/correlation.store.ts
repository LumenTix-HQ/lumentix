import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface CorrelationContext {
  correlationId: string;
}

@Injectable()
export class CorrelationStore {
  private readonly als = new AsyncLocalStorage<CorrelationContext>();

  run<T>(correlationId: string, fn: () => T): T {
    return this.als.run({ correlationId }, fn);
  }

  getCorrelationId(): string | undefined {
    return this.als.getStore()?.correlationId;
  }
}
