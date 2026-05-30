import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';

export const WEBHOOK_QUEUE = 'webhook-delivery';

export interface WebhookJobData {
  deliveryId: string;
  url: string;
  payload: Record<string, unknown>;
  secret: string;
  attempt: number;
}

@Processor(WEBHOOK_QUEUE)
export class WebhookDeliveryJob {
  private readonly logger = new Logger(WebhookDeliveryJob.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
  ) {}

  @Process('deliver')
  async deliver(job: Job<WebhookJobData>): Promise<void> {
    const { deliveryId, url, payload, secret, attempt } = job.data;

    const body = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    let statusCode: number | null = null;
    let responseBody: string | null = null;

    try {
      const result = await this.postRequest(url, body, signature);
      statusCode = result.statusCode;
      responseBody = result.body;
    } catch (err) {
      this.logger.warn(`Webhook delivery attempt ${attempt} failed for ${deliveryId}: ${err}`);

      const backoffDelays = [1000, 2000, 4000, 8000, 16000];
      if (attempt < 5) {
        const delay = backoffDelays[attempt] ?? 16000;
        await job.queue.add(
          'deliver',
          { ...job.data, attempt: attempt + 1 },
          { delay },
        );
      }

      await this.deliveryRepo.update(deliveryId, {
        attempt,
        statusCode: null,
        responseBody: String(err),
      });
      return;
    }

    await this.deliveryRepo.update(deliveryId, {
      attempt,
      statusCode,
      responseBody,
    });

    this.logger.log(
      `Webhook delivered to ${url} — status ${statusCode} (attempt ${attempt})`,
    );
  }

  private postRequest(
    url: string,
    body: string,
    signature: string,
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Lumentix-Signature': `sha256=${signature}`,
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () =>
          resolve({ statusCode: res.statusCode ?? 0, body: data }),
        );
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Webhook request timed out'));
      });

      req.write(body);
      req.end();
    });
  }
}
