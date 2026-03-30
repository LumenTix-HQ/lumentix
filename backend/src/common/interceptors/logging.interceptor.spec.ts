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
});
