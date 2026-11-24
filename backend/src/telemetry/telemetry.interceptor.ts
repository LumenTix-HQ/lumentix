import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { TelemetryService } from './telemetry.service';

@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TelemetryInterceptor.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const startedAt = Date.now();
    const path = request.path ?? request.url;

    if (path.startsWith('/telemetry') || path.startsWith('/health')) {
      return next.handle();
    }

    let recorded = false;
    const record = (statusCode: number): void => {
      if (recorded) return;
      recorded = true;
      const routePath = (request.route as { path?: unknown } | undefined)?.path;
      const route =
        typeof routePath === 'string' && routePath
          ? `${request.baseUrl ?? ''}${routePath}`
          : path.split('?')[0];

      void this.telemetryService
        .recordApiRequest(
          Date.now() - startedAt,
          statusCode,
          request.method,
          route,
        )
        .catch((error: unknown) => {
          this.logger.error(
            'Failed to record API request telemetry',
            error instanceof Error ? error.stack : String(error),
          );
        });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const response = http.getResponse<Response>();
          record(response.statusCode);
        },
        error: (error: unknown) => {
          const statusCode =
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            typeof error.status === 'number'
              ? error.status
              : 500;
          record(statusCode);
        },
      }),
    );
  }
}
