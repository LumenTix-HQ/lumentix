import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

interface HttpExceptionResponseBody {
  message?: string | string[];
  error?: string;
}

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  allMessages: string[];
  error: string;
  timestamp: string;
  path: string;
  method: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as HttpExceptionResponseBody;
        if (body.message) message = body.message;
        if (body.error) error = body.error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      if (process.env.NODE_ENV === 'production') {
        message = 'An unexpected error occurred';
      }
    }

    const allMessages = Array.isArray(message) ? message : [message];

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: allMessages[0] ?? message,
      allMessages,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    if (status >= 500) {
      const errorMessage =
        exception instanceof Error ? exception.message : String(exception);
      const errorStack =
        exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.url} ${status} Error: ${errorMessage}`,
        errorStack,
      );
    }

    response.status(status).json(errorResponse);
  }
}
