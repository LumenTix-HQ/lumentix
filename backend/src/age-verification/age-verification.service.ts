import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import {
  KycDocument,
  KycStatus,
} from '../identity/entities/kyc-document.entity';
import { AgeProofVerifier } from './entities/age-proof-verifier.entity';

const PROOF_VERSION = 'v1';
const PROOF_TTL_SECONDS = 600; // proofs are short-lived

interface AgeProofPayload {
  /** Subject the proof was issued to */
  sub: string;
  /** The age threshold the server verified the subject meets */
  ageGte: number;
  /** Issued-at (unix seconds) */
  iat: number;
  /** Expiry (unix seconds) */
  exp: number;
}

/**
 * Server-signed age proofs.
 *
 * NOTE: despite the historical `zkp` naming this is **not** a zero-knowledge
 * proof — there is no circuit. The server reads the user's verified date of
 * birth from their approved KYC record and issues an HMAC-signed token over
 * `{ sub, ageGte, iat, exp }`. Verifiers can confirm the server issued the
 * claim without trusting anything supplied by the client.
 */
@Injectable()
export class AgeProofService {
  constructor(
    @InjectRepository(KycDocument)
    private readonly kycRepository: Repository<KycDocument>,
    @InjectRepository(AgeProofVerifier)
    private readonly verifierRepository: Repository<AgeProofVerifier>,
    private readonly configService: ConfigService,
  ) {}

  async generateAgeProof(userId: string, minimumAge: number) {
    const dateOfBirth = await this.getVerifiedDateOfBirth(userId);
    const age = this.computeAge(dateOfBirth);

    if (age < minimumAge) {
      throw new BadRequestException(
        'Verified age does not meet the requested minimum',
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const payload: AgeProofPayload = {
      sub: userId,
      ageGte: minimumAge,
      iat: now,
      exp: now + PROOF_TTL_SECONDS,
    };

    const encodedPayload = this.base64UrlEncode(
      Buffer.from(JSON.stringify(payload)),
    );
    const signature = this.sign(encodedPayload);

    return {
      proof: `${PROOF_VERSION}.${encodedPayload}.${signature}`,
      minimumAge,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      generated: true,
    };
  }

  verifyAgeProof(proof: string, minimumAge: number) {
    const payload = this.verifyToken(proof);
    if (!payload) {
      return { valid: false, minimumAge };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return { valid: false, minimumAge };
    }

    return {
      valid: payload.ageGte >= minimumAge,
      minimumAge,
      subject: payload.sub,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  async registerVerifier(
    verifierId: string,
    name: string,
    registeredBy: string | null,
  ) {
    const existing = await this.verifierRepository.findOne({
      where: { verifierId },
    });
    if (existing) {
      throw new ConflictException('Verifier already registered');
    }

    const verifier = this.verifierRepository.create({
      verifierId,
      name,
      registeredBy,
    });
    const saved = await this.verifierRepository.save(verifier);

    return {
      verifierId: saved.verifierId,
      name: saved.name,
      registered: true,
      registeredAt: saved.registeredAt,
    };
  }

  /** Load the date of birth from the user's approved KYC submission. */
  private async getVerifiedDateOfBirth(userId: string): Promise<string> {
    const approved = await this.kycRepository.findOne({
      where: { userId, status: KycStatus.APPROVED },
      order: { reviewedAt: 'DESC' },
    });

    if (!approved || !approved.dateOfBirth) {
      throw new BadRequestException(
        'No verified identity record with a date of birth was found for this user',
      );
    }

    return approved.dateOfBirth;
  }

  /** Accepts an ISO date (YYYY-MM-DD) or a bare 4-digit year. */
  private computeAge(dateOfBirth: string): number {
    const value = dateOfBirth.trim();
    const currentYear = new Date().getUTCFullYear();

    if (/^\d{4}$/.test(value)) {
      return currentYear - parseInt(value, 10);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date of birth on identity record');
    }

    let age = currentYear - parsed.getUTCFullYear();
    const monthDelta = new Date().getUTCMonth() - parsed.getUTCMonth();
    if (
      monthDelta < 0 ||
      (monthDelta === 0 && new Date().getUTCDate() < parsed.getUTCDate())
    ) {
      age -= 1;
    }
    return age;
  }

  private sign(encodedPayload: string): string {
    return this.base64UrlEncode(
      createHmac('sha256', this.signingSecret).update(encodedPayload).digest(),
    );
  }

  private verifyToken(proof: string): AgeProofPayload | null {
    if (typeof proof !== 'string') return null;

    const parts = proof.split('.');
    if (parts.length !== 3 || parts[0] !== PROOF_VERSION) return null;

    const [, encodedPayload, signature] = parts;
    const expected = this.sign(encodedPayload);

    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        this.base64UrlDecode(encodedPayload).toString('utf8'),
      ) as AgeProofPayload;
      if (
        typeof decoded?.sub !== 'string' ||
        typeof decoded?.ageGte !== 'number' ||
        typeof decoded?.exp !== 'number'
      ) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  private get signingSecret(): string {
    const secret =
      this.configService.get<string>('ZKP_SIGNING_SECRET') ??
      this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new UnauthorizedException('Age proof signing secret is not configured');
    }
    return secret;
  }

  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private base64UrlDecode(value: string): Buffer {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64');
  }
}
