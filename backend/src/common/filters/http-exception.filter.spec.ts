import { ArgumentsHost, HttpException, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  function buildHost(url = '/test-error') {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url }),
      }),
    } as unknown as ArgumentsHost;
    return { host, mockStatus, mockJson };
  }

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('should catch HttpException and map to response', () => {
    const { host, mockStatus, mockJson } = buildHost('/test-error');

    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(403);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 403,
      timestamp: expect.any(String),
      path: '/test-error',
      message: 'Forbidden',
      error: 'FORBIDDEN',
    });
  });

  it('should handle unhandled exceptions correctly (500)', () => {
    const { host, mockStatus, mockJson } = buildHost('/unknown-error');

    const exception = new Error('Random error that is not an HttpException');
    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 500,
      timestamp: expect.any(String),
      path: '/unknown-error',
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  });

  // ── Additional coverage ──────────────────────────────────────────────────

  it('should handle NotFoundException (404)', () => {
    const { host, mockStatus, mockJson } = buildHost('/not-found');

    filter.catch(new NotFoundException('Resource not found'), host);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        path: '/not-found',
      }),
    );
  });

  it('should handle BadRequestException (400)', () => {
    const { host, mockStatus, mockJson } = buildHost('/bad-request');

    filter.catch(new BadRequestException('Validation failed'), host);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        path: '/bad-request',
      }),
    );
  });

  it('response includes a valid ISO timestamp', () => {
    const { host, mockJson } = buildHost('/ts-check');

    filter.catch(new HttpException('OK', HttpStatus.OK), host);

    const call = mockJson.mock.calls[0][0];
    expect(() => new Date(call.timestamp)).not.toThrow();
    expect(new Date(call.timestamp).toISOString()).toBe(call.timestamp);
  });

  it('response includes the request path', () => {
    const { host, mockJson } = buildHost('/api/v1/events');

    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), host);

    expect(mockJson.mock.calls[0][0].path).toBe('/api/v1/events');
  });

  it('should handle HttpException with object response body', () => {
    const { host, mockStatus, mockJson } = buildHost('/obj-body');

    const exception = new HttpException(
      { message: 'Custom message', error: 'Custom Error' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(422);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'Custom message',
        error: 'Custom Error',
      }),
    );
  });
});
