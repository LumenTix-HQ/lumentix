import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';

@Injectable()
export class TicketSigningService {
  private readonly secret: string;
  private readonly publicKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.get<string>('TICKET_SIGNING_SECRET') ?? '';
    this.publicKey =
      this.configService.get<string>('TICKET_SIGNING_PUBLIC_KEY') ?? '';
  }

  sign(ticketId: string): string {
    try {
      const kp = Keypair.fromSecret(this.secret);
      const signature = kp.sign(Buffer.from(ticketId));
      return Buffer.from(signature).toString('hex');
    } catch (err) {
      throw new BadRequestException('Failed to sign ticket');
    }
  }

  verify(ticketId: string, signatureHex: string): boolean {
    try {
      const kp = Keypair.fromPublicKey(this.publicKey);
      const msg = Buffer.from(ticketId);
      const sig = Buffer.from(signatureHex, 'hex');
      return kp.verify(msg, sig);
    } catch (err) {
      return false;
    }
  }
}
