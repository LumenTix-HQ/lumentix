import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';
import { EscrowService } from '../payments/services/escrow.service';
import { SorobanService } from '../stellar/soroban.service';

@Injectable()
export class SmartRefundService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly escrowService: EscrowService,
    private readonly sorobanService: SorobanService,
  ) {}

  async cancelEventOnChain(
    eventId: string,
  ): Promise<{ eventId: string; status: string; timestamp: string }> {
    const { contractEventId, organizerSecret } =
      await this.getOnChainContext(eventId);
    await this.sorobanService.cancelEventOnChain(
      organizerSecret,
      contractEventId,
    );

    return {
      eventId,
      status: 'cancelled_on_chain',
      timestamp: new Date().toISOString(),
    };
  }

  async cancel_event_on_chain(
    eventId: string,
  ): Promise<{ eventId: string; status: string; timestamp: string }> {
    return this.cancelEventOnChain(eventId);
  }

  async executeMassRefund(eventId: string): Promise<{
    eventId: string;
    refundedCount: number;
  }> {
    const { contractEventId, organizerSecret } =
      await this.getOnChainContext(eventId);
    const refundedCount = await this.sorobanService.executeMassRefund(
      organizerSecret,
      contractEventId,
    );
    return { eventId, refundedCount };
  }

  async execute_mass_refund(
    eventId: string,
  ): Promise<{ eventId: string; refundedCount: number }> {
    return this.executeMassRefund(eventId);
  }

  async verifyRefundCompletion(eventId: string): Promise<{
    eventId: string;
    complete: boolean;
  }> {
    const { contractEventId } = await this.getOnChainContext(eventId);
    const complete =
      await this.sorobanService.verifyRefundCompletion(contractEventId);
    return { eventId, complete };
  }

  async verify_refund_completion(
    eventId: string,
  ): Promise<{ eventId: string; complete: boolean }> {
    return this.verifyRefundCompletion(eventId);
  }

  private async getOnChainContext(
    eventId: string,
  ): Promise<{ contractEventId: string; organizerSecret: string }> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }
    if (!event.contractEventId || !event.escrowSecretEncrypted) {
      throw new BadRequestException(
        'Event does not have an on-chain contract and organizer key',
      );
    }

    const organizerSecret = await this.escrowService.decryptEscrowSecret(
      event.escrowSecretEncrypted,
    );
    return { contractEventId: event.contractEventId, organizerSecret };
  }
}
