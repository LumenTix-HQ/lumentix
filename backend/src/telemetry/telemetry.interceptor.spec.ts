import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { TelemetryInterceptor } from './telemetry.interceptor';
import { TelemetryService } from './telemetry.service';

describe('TelemetryInterceptor', () => {
  const telemetryService = {
    recordApiRequest: jest.fn().mockResolvedValue(undefined),
  };
  let interceptor: TelemetryInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new TelemetryInterceptor(
      telemetryService as unknown as TelemetryService,
    );
  });

  it('records request latency, load, and status through TelemetryService', (done) => {
    const request = {
      method: 'GET',
      path: '/events/123',
      url: '/events/123?include=tickets',
      baseUrl: '/events',
      route: { path: '/:id' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
    const handler = { handle: () => of({ id: 'event-1' }) } as CallHandler;

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(telemetryService.recordApiRequest).toHaveBeenCalledWith(
          expect.any(Number),
          200,
          'GET',
          '/events/:id',
        );
        done();
      },
    });
  });

  it('records failed requests and excludes health endpoints', (done) => {
    const request = {
      method: 'GET',
      path: '/events',
      url: '/events',
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 500 }),
      }),
    } as unknown as ExecutionContext;
    const handler = {
      handle: () => throwError(() => ({ status: 503 })),
    } as CallHandler;

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(telemetryService.recordApiRequest).toHaveBeenCalledWith(
          expect.any(Number),
          503,
          'GET',
          '/events',
        );

        request.path = '/health';
        interceptor
          .intercept(context, {
            handle: () => of({ status: 'ok' }),
          } as CallHandler)
          .subscribe(() => {
            expect(telemetryService.recordApiRequest).toHaveBeenCalledTimes(1);
            done();
          });
      },
    });
  });

  it('logs telemetry write failures without changing the response', (done) => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    telemetryService.recordApiRequest.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/events',
          url: '/events',
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    interceptor
      .intercept(context, { handle: () => of('response') } as CallHandler)
      .subscribe({
        next: (value) => expect(value).toBe('response'),
        complete: () => {
          setImmediate(() => {
            expect(loggerError).toHaveBeenCalled();
            done();
          });
        },
      });
  });
});
