import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('should catch HttpException and map to response', () => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    const mockContext = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url: '/test-error' }),
      }),
    } as unknown as ArgumentsHost;

    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    filter.catch(exception, mockContext);

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
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    const mockContext = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url: '/unknown-error' }),
      }),
    } as unknown as ArgumentsHost;

    const exception = new Error('Random error that is not an HttpException');
    filter.catch(exception, mockContext);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 500,
      timestamp: expect.any(String),
      path: '/unknown-error',
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  });
});
