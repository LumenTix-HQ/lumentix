import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let loggerSpyLog: jest.SpyInstance;
  let loggerSpyError: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    loggerSpyLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    loggerSpyError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log successful requests', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/test' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: () => of('test-data'),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: () => {
        expect(loggerSpyLog).toHaveBeenCalled();
        const logArgs = loggerSpyLog.mock.calls[0][0];
        expect(logArgs).toMatch(/GET \/test 200 \+\d+ms/);
        done();
      },
    });
  });

  it('should log thrown errors', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/error' }),
      }),
    } as unknown as ExecutionContext;

    const mockError = { status: 400 };
    const mockCallHandler = {
      handle: () => throwError(() => mockError),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      error: (err) => {
        expect(err).toBe(mockError);
        expect(loggerSpyError).toHaveBeenCalled();
        const logArgs = loggerSpyError.mock.calls[0][0];
        expect(logArgs).toMatch(/POST \/error 400 \+\d+ms/);
        done();
      },
    });
  });

  // ── Additional coverage ──────────────────────────────────────────────────

  it('should pass through the response value unchanged', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/data' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: () => of({ id: 1, name: 'test' }),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: (value) => {
        expect(value).toEqual({ id: 1, name: 'test' });
        done();
      },
    });
  });

  it('should re-throw the error after logging', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'DELETE', url: '/resource/1' }),
      }),
    } as unknown as ExecutionContext;

    const originalError = new Error('something went wrong');
    const mockCallHandler = {
      handle: () => throwError(() => originalError),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      error: (err) => {
        expect(err).toBe(originalError);
        expect(loggerSpyError).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should use 500 as default status when error has no status', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/crash' }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: () => throwError(() => new Error('no status')),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      error: () => {
        const logArgs = loggerSpyError.mock.calls[0][0];
        expect(logArgs).toMatch(/GET \/crash 500 \+\d+ms/);
        done();
      },
    });
  });

  it('should log the correct HTTP method and URL', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'PATCH', url: '/users/42' }),
        getResponse: () => ({ statusCode: 204 }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: () => of(null),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: () => {
        const logArgs = loggerSpyLog.mock.calls[0][0];
        expect(logArgs).toMatch(/PATCH \/users\/42 204 \+\d+ms/);
        done();
      },
    });
  });
});
