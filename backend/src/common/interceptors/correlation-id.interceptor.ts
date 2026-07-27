import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { CorrelationStore } from '../correlation/correlation.store';
import { LoggerService } from '../logging/logger.service';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  constructor(
    private readonly correlationStore: CorrelationStore,
    private readonly loggerService: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ??
      crypto.randomUUID();

    (request as any)['correlationId'] = correlationId;

    return this.correlationStore.run(correlationId, () =>
      this.loggerService.runWithCorrelationId(correlationId, () =>
        next.handle().pipe(
          tap(() => {
            response.setHeader('X-Correlation-ID', correlationId);
          }),
        ),
      ),
    );
  }
}
