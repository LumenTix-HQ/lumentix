import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as qrcode from 'qrcode';
import Redis from 'ioredis';
import { TicketEntity } from '../entities/ticket.entity';
import { REDIS_CLIENT } from '../../common/redis/redis.provider';

@Injectable()
export class DynamicQrService {
  private readonly logger = new Logger(DynamicQrService.name);
  private readonly STEP_SECONDS = 30;
  private readonly OTP_DIGITS = 6;
  private readonly DRIFT_TOLERANCE_MS = 5000; // 5 seconds

  constructor(
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  private getTicketSecret(ticketId: string): Buffer {
    const signingSecret = this.configService.get<string>('TICKET_SIGNING_SECRET');
    return crypto
      .createHmac('sha256', signingSecret)
      .update(ticketId)
      .digest();
  }

  private generateOtp(counter: number, secret: Buffer): string {
    const hmac = crypto.createHmac('sha1', secret);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const digest = hmac.update(buf).digest();

    const offset = digest[digest.length - 1] & 0xf;
    const code =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    return (code % Math.pow(10, this.OTP_DIGITS))
      .toString()
      .padStart(this.OTP_DIGITS, '0');
  }

  private getCurrentCounter(timestampMs?: number): number {
    const ts = timestampMs || Date.now();
    return Math.floor(ts / 1000 / this.STEP_SECONDS);
  }

  async generateDynamicQr(ticketId: string, requesterId: string): Promise<{
    qrCodeDataUrl: string;
    otp: string;
    expiresAt: number;
    refreshInSeconds: number;
  }> {
    const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
    }

    if (ticket.ownerId !== requesterId) {
      throw new BadRequestException('You do not own this ticket');
    }

    if (ticket.status !== 'valid') {
      throw new BadRequestException(`Ticket status is "${ticket.status}", must be "valid"`);
    }

    const secret = this.getTicketSecret(ticketId);
    const counter = this.getCurrentCounter();
    const otp = this.generateOtp(counter, secret);

    const expiresAtMs = (counter + 1) * this.STEP_SECONDS * 1000;
    const nowMs = Date.now();
    const refreshInSeconds = Math.ceil((expiresAtMs - nowMs) / 1000);

    const qrPayload = {
      ticketId,
      otp,
      counter,
      expiresAtMs,
    };

    const qrCodeDataUrl = await qrcode.toDataURL(JSON.stringify(qrPayload));

    this.logger.debug(`Generated dynamic QR for ticket ${ticketId}`);

    return {
      qrCodeDataUrl,
      otp,
      expiresAt: expiresAtMs,
      refreshInSeconds,
    };
  }

  async validateTimeOtp(
    ticketId: string,
    otp: string,
    validatorTimestampMs?: number,
  ): Promise<{
    valid: boolean;
    counter: number;
    message: string;
  }> {
    const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
    }

    const secret = this.getTicketSecret(ticketId);
    const timestampMs = validatorTimestampMs || Date.now();
    const counter = this.getCurrentCounter(timestampMs);

    const validOtps: number[] = [
      this.generateOtp(counter - 1, secret),
      this.generateOtp(counter, secret),
      this.generateOtp(counter + 1, secret),
    ].map(o => parseInt(o, 10));

    const inputOtp = parseInt(otp, 10);
    const isValid = validOtps.includes(inputOtp);

    const result = {
      valid: isValid,
      counter,
      message: isValid ? 'OTP is valid' : 'Invalid or expired OTP',
    };

    this.logger.debug(
      `OTP validation for ticket ${ticketId}: ${result.message} (counter: ${counter})`,
    );

    return result;
  }

  async syncValidatorClock(validatorIp: string, validatorTimestampMs: number): Promise<{
    serverTimeMs: number;
    driftMs: number;
    stepSeconds: number;
    maxDriftMs: number;
  }> {
    const serverTimeMs = Date.now();
    const driftMs = serverTimeMs - validatorTimestampMs;

    const driftKey = `clock:drift:${validatorIp}`;
    await this.redis.set(driftKey, driftMs.toString(), 'EX', 3600);

    const maxDriftMs = this.DRIFT_TOLERANCE_MS;
    const syncStatus = Math.abs(driftMs) <= maxDriftMs ? 'SYNCED' : 'OUT_OF_SYNC';

    this.logger.debug(
      `Validator ${validatorIp} clock sync: drift=${driftMs}ms, status=${syncStatus}`,
    );

    return {
      serverTimeMs,
      driftMs,
      stepSeconds: this.STEP_SECONDS,
      maxDriftMs,
    };
  }

  async getValidatorClockDrift(validatorIp: string): Promise<number | null> {
    const driftKey = `clock:drift:${validatorIp}`;
    const drift = await this.redis.get(driftKey);
    return drift ? parseInt(drift, 10) : null;
  }
}
