import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const user = (request as any).user;
    const userId = user?.id || user?.sub || 'anonymous';
    
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = ctx.getResponse<Response>();
        const statusCode = response.statusCode;
        const delay = Date.now() - now;
        
        this.logger.log(
          `${method} ${url} ${statusCode} - ${delay}ms | IP: ${ip} | User: ${userId} | UA: ${userAgent}`,
        );
      }),
      catchError((error) => {
        const statusCode = error.status || error.statusCode || 500;
        const delay = Date.now() - now;
        
        this.logger.error(
          `${method} ${url} ${statusCode} - ${delay}ms | IP: ${ip} | User: ${userId} | Error: ${error.message}`,
        );
        throw error;
      }),
    );
  }
}

