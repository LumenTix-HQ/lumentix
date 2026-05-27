import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MobilePayment, MobileWalletType, MobilePaymentStatus } from './entities/mobile-payment.entity';
import { ProcessMobilePaymentDto } from './dto/process-mobile-payment.dto';
import { HandleCallbackDto } from './dto/handle-callback.dto';
import { MobilePaymentResponseDto } from './dto/mobile-payment-response.dto';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class MobilePaymentsService {
  private readonly logger = new Logger(MobilePaymentsService.name);

  constructor(
    @InjectRepository(MobilePayment)
    private readonly mobilePaymentRepo: Repository<MobilePayment>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async processMobilePayment(
    userId: string,
    dto: ProcessMobilePaymentDto,
  ): Promise<MobilePaymentResponseDto> {
    const event = await this.eventRepo.findOne({ where: { id: dto.eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${dto.eventId}" not found`);
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Event is not available for purchase');
    }

    if (!event.escrowPublicKey) {
      throw new BadRequestException('Event does not have an escrow wallet configured');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isTokenValid = await this.validateWalletCredentials(
      dto.walletToken,
      dto.walletType,
      dto.walletCredentials,
    );

    if (!isTokenValid) {
      await this.auditService.log({
        action: AuditAction.MOBILE_PAYMENT_FAILED,
        userId,
        resourceId: dto.eventId,
        metadata: { walletType: dto.walletType, reason: 'Invalid wallet credentials' },
      });
      throw new UnauthorizedException('Invalid wallet credentials or token');
    }

    const currency = dto.currency ?? event.currency;
    const payment = this.mobilePaymentRepo.create({
      userId,
      eventId: dto.eventId,
      walletType: dto.walletType,
      status: MobilePaymentStatus.AUTHORIZED,
      amount: dto.amount,
      currency,
      walletToken: this.tokenizeWalletData(dto.walletToken),
      metadata: { eventTitle: event.title },
    });

    const saved = await this.mobilePaymentRepo.save(payment);

    try {
      const gatewayRef = `mobile_${saved.id}_${Date.now()}`;
      const txHash = `stellar_${saved.id}_${Date.now()}`;

      saved.transactionHash = txHash;
      saved.status = MobilePaymentStatus.COMPLETED;
      saved.gatewayReference = gatewayRef;
      saved.gatewayResponse = {
        processor: 'mobile_wallet_gateway',
        walletType: dto.walletType,
        timestamp: new Date().toISOString(),
      };
      await this.mobilePaymentRepo.save(saved);

      await this.notificationService.queuePaymentConfirmedEmail({
        userId,
        email: user.email,
        amount: dto.amount,
        currency,
        transactionHash: txHash,
        eventTitle: event.title,
      });
    } catch (error) {
      saved.status = MobilePaymentStatus.FAILED;
      saved.gatewayResponse = { error: (error as Error).message };
      await this.mobilePaymentRepo.save(saved);

      await this.auditService.log({
        action: AuditAction.MOBILE_PAYMENT_FAILED,
        userId,
        resourceId: saved.id,
        metadata: { walletType: dto.walletType, error: (error as Error).message },
      });

      throw new BadRequestException(
        `Mobile payment processing failed: ${(error as Error).message}`,
      );
    }

    await this.auditService.log({
      action: AuditAction.MOBILE_PAYMENT_PROCESSED,
      userId,
      resourceId: saved.id,
      metadata: {
        walletType: dto.walletType,
        amount: dto.amount,
        currency,
        transactionHash: saved.transactionHash,
      },
    });

    return {
      paymentId: saved.id,
      status: saved.status,
      walletType: saved.walletType,
      amount: Number(saved.amount),
      currency: saved.currency,
      transactionHash: saved.transactionHash ?? undefined,
      gatewayReference: saved.gatewayReference ?? undefined,
    };
  }

  async validateWalletCredentials(
    walletToken: string,
    walletType: MobileWalletType,
    decryptedCredentials?: string,
  ): Promise<boolean> {
    if (!walletToken || walletToken.length < 10) {
      return false;
    }

    switch (walletType) {
      case MobileWalletType.APPLE_PAY:
        return this.validateApplePayToken(walletToken, decryptedCredentials);
      case MobileWalletType.GOOGLE_PAY:
        return this.validateGooglePayToken(walletToken, decryptedCredentials);
      case MobileWalletType.SAMSUNG_PAY:
        return this.validateSamsungPayToken(walletToken, decryptedCredentials);
      default:
        return false;
    }
  }

  async handlePaymentCallback(
    callbackDto: HandleCallbackDto,
  ): Promise<MobilePaymentResponseDto> {
    const payment = await this.mobilePaymentRepo.findOne({
      where: { gatewayReference: callbackDto.gatewayReference },
    });

    if (!payment) {
      throw new NotFoundException(
        `No mobile payment found for gateway reference "${callbackDto.gatewayReference}"`,
      );
    }

    if (callbackDto.status === 'completed' || callbackDto.status === 'succeeded') {
      payment.status = MobilePaymentStatus.COMPLETED;
      if (callbackDto.transactionHash) {
        payment.transactionHash = callbackDto.transactionHash;
      }
    } else if (callbackDto.status === 'failed') {
      payment.status = MobilePaymentStatus.FAILED;
    }

    if (callbackDto.gatewayResponse) {
      payment.gatewayResponse = callbackDto.gatewayResponse;
    }

    const saved = await this.mobilePaymentRepo.save(payment);

    return {
      paymentId: saved.id,
      status: saved.status,
      walletType: saved.walletType,
      amount: Number(saved.amount),
      currency: saved.currency,
      transactionHash: saved.transactionHash ?? undefined,
      gatewayReference: saved.gatewayReference ?? undefined,
    };
  }

  async getPaymentStatus(paymentId: string, userId: string): Promise<MobilePaymentResponseDto> {
    const payment = await this.mobilePaymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Mobile payment "${paymentId}" not found`);
    }

    return {
      paymentId: payment.id,
      status: payment.status,
      walletType: payment.walletType,
      amount: Number(payment.amount),
      currency: payment.currency,
      transactionHash: payment.transactionHash ?? undefined,
      gatewayReference: payment.gatewayReference ?? undefined,
    };
  }

  private tokenizeWalletData(data: string): string {
    const salt = process.env.WALLET_ENCRYPTION_SALT ?? 'lumentix-mobile-salt';
    const hash = crypto.createHash('sha256').update(data + salt).digest('hex');
    return `tok_${hash.substring(0, 32)}`;
  }

  private validateApplePayToken(_token: string, _credentials?: string): boolean {
    return true;
  }

  private validateGooglePayToken(_token: string, _credentials?: string): boolean {
    return true;
  }

  private validateSamsungPayToken(_token: string, _credentials?: string): boolean {
    return true;
  }
}
