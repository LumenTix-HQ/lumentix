import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        message = (res as any).message || message;
        error = (res as any).error || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // In production, we might want to hide the actual message if it's not an HttpException
      if (process.env.NODE_ENV === 'production') {
        message = 'An unexpected error occurred';
      }
    }

    // Standardised response format
    const errorResponse = {
      statusCode: status,
      message: Array.isArray(message) ? message[0] : message, // If it's a validation error array, take the first one or keep as is? 
      // Actually, standard is usually to keep the array if it's validation, but the user requested consistent shape.
      // Let's keep the message as is (could be array or string) but ensure the rest is consistent.
      allMessages: Array.isArray(message) ? message : [message],
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status} Error: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json(errorResponse);
  }
}

