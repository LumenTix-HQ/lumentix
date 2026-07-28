import { Injectable, Logger } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { createConnection } from 'net';

@Injectable()
export class SmtpHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(SmtpHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT') ?? 587;

    if (!host) {
      return this.getStatus(key, true, { message: 'SMTP not configured — skipping' });
    }

    try {
      await this.tcpCheck(host, port);
      return this.getStatus(key, true, { host, port });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'SMTP unreachable';
      this.logger.error(`SMTP health check failed: ${message}`);
      throw new HealthCheckError(
        'SMTP check failed',
        this.getStatus(key, false, { error: message }),
      );
    }
  }

  private tcpCheck(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(port, host, () => {
        socket.end();
        resolve();
      });

      socket.setTimeout(3000, () => {
        socket.destroy();
        reject(new Error(`Connection timed out after 3000ms`));
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  }
}
