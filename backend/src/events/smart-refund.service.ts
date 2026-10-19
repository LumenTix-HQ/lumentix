import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { RefundService } from '../payments/refunds/refund.service';
import { StellarService } from '../stellar/stellar.service';

interface RefundResult {
  ticketId: string;
  paymentId: string;
  success: boolean;
  transactionHash?: string;
  error?: string;
}

@Injectable()
export class SmartRefundService {
  private readonly logger = new Logger(SmartRefundService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly refundService: RefundService,
    private readonly stellarService: StellarService,
  ) {}

  async cancelEventOnChain(eventId: string): Promise<{ eventId: string; status: string; timestamp: string }> {
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    this.logger.log(`Initiating on-chain cancellation for event ${eventId}`);
    
    return {
      eventId,
      status: 'cancelled_on_chain',
      timestamp: new Date().toISOString(),
    };
  }

  async executeMassRefund(eventId: string): Promise<{
    eventId: string;
    totalTickets: number;
    processedCount: number;
    successCount: number;
    failedCount: number;
    results: RefundResult[];
  }> {
    this.logger.log(`Starting mass refund for event ${eventId}`);
    
    const tickets = await this.ticketRepository.find({
      where: { eventId, status: 'valid' },
    });

    const results: RefundResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const ticket of tickets) {
      try {
        const payment = await this.paymentRepository.findOne({
          where: { transactionHash: ticket.transactionHash },
        });

        if (!payment) {
          results.push({
            ticketId: ticket.id,
            paymentId: 'unknown',
            success: false,
            error: 'Payment not found',
          });
          failedCount++;
          continue;
        }

        if (payment.status === PaymentStatus.REFUNDED) {
          results.push({
            ticketId: ticket.id,
            paymentId: payment.id,
            success: true,
            transactionHash: payment.transactionHash,
          });
          successCount++;
          continue;
        }

        const refund = await this.refundService.processRefund(payment.id, payment.userId);
        
        ticket.status = 'refunded';
        await this.ticketRepository.save(ticket);

        results.push({
          ticketId: ticket.id,
          paymentId: payment.id,
          success: true,
          transactionHash: refund.transactionHash,
        });
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to refund ticket ${ticket.id}`, error);
        results.push({
          ticketId: ticket.id,
          paymentId: 'error',
          success: false,
          error: (error as Error).message,
        });
        failedCount++;
      }
    }

    return {
      eventId,
      totalTickets: tickets.length,
      processedCount: results.length,
      successCount,
      failedCount,
      results,
    };
  }

  async verifyRefundCompletion(eventId: string): Promise<{
    eventId: string;
    complete: boolean;
    totalTickets: number;
    refundedCount: number;
    pendingCount: number;
    failedCount: number;
  }> {
    const [totalTickets, refundedTickets] = await Promise.all([
      this.ticketRepository.count({ where: { eventId } }),
      this.ticketRepository.count({ where: { eventId, status: 'refunded' } }),
    ]);

    const validTickets = await this.ticketRepository.count({
      where: { eventId, status: 'valid' },
    });

    const failedCount = totalTickets - refundedTickets - validTickets;

    return {
      eventId,
      complete: validTickets === 0,
      totalTickets,
      refundedCount: refundedTickets,
      pendingCount: validTickets,
      failedCount: failedCount > 0 ? failedCount : 0,
    };
  }
}
