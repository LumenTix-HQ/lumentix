import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Observable } from 'rxjs';

type LogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
  verbose: 4,
};

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly als = new AsyncLocalStorage<{ correlationId: string }>();
  private readonly service: string;
  private readonly minLevel: LogLevel;

  constructor() {
    this.service = process.env.npm_package_name ?? 'lumentix-backend';
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'log';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private write(level: LogLevel, message: string, context?: string): void {
    if (!this.shouldLog(level)) return;

    const store = this.als.getStore();
    const correlationId = store?.correlationId ?? '';

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId,
      service: this.service,
      context,
      message,
    };

    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  log(message: string, context?: string): void {
    this.write('log', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    if (!this.shouldLog('error')) return;

    const store = this.als.getStore();
    const correlationId = store?.correlationId ?? '';

    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      correlationId,
      service: this.service,
      context,
      message,
      trace,
    };

    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.write('verbose', message, context);
  }

  runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
    return this.als.run({ correlationId }, fn);
  }

  runWithCorrelationIdAsync<T>(
    correlationId: string,
    fn: () => Observable<T>,
  ): Observable<T> {
    return this.als.run({ correlationId }, fn);
  }
}
