import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { KycDocument, KycStatus } from './entities/kyc-document.entity';
import { VerifiedCredential } from './entities/verified-credential.entity';
import {
  CheckEventCredentialDto,
  CredentialProvider,
  IssueVerifiedCredentialDto,
  KycReviewDecision,
  ReviewKycDocumentDto,
  RevokeCredentialDto,
  SubmitKycDocumentsDto,
} from './dto/kyc.dto';

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface VerifyCredentialResult {
  valid: boolean;
  reason?: string;
  credential: VerifiedCredential;
}

export interface EventCredentialCheckResult {
  /** Whether the user holds a valid, active verified credential */
  verified: boolean;
  /** Short explanation of the outcome */
  reason: string;
  /** The matching credential when verified = true */
  credential: VerifiedCredential | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    @InjectRepository(KycDocument)
    private readonly kycRepository: Repository<KycDocument>,

    @InjectRepository(VerifiedCredential)
    private readonly credentialRepository: Repository<VerifiedCredential>,
  ) {}

  // ── submit_kyc_documents ──────────────────────────────────────────────────

  /**
   * User submits identity documents to begin the KYC process.
   *
   * Rules enforced:
   *  - One pending submission per user × document-type at a time.
   *  - A user who already has an APPROVED KYC of that type can still submit a
   *    new one (e.g. after a passport renewal), but only if no PENDING one exists.
   */
  async submitKycDocuments(
    userId: string,
    dto: SubmitKycDocumentsDto,
  ): Promise<KycDocument> {
    const existingPending = await this.kycRepository.findOne({
      where: { userId, documentType: dto.documentType, status: KycStatus.PENDING },
    });

    if (existingPending) {
      throw new ConflictException(
        'A pending KYC submission already exists for this document type. ' +
          'Wait for the current submission to be reviewed before resubmitting.',
      );
    }

    const doc = this.kycRepository.create({
      userId,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      documentUrl: dto.documentUrl ?? null,
      fullName: dto.fullName ?? null,
      dateOfBirth: dto.dateOfBirth ?? null,
      countryCode: dto.countryCode ?? null,
      status: KycStatus.PENDING,
      reviewedBy: null,
      reviewerNotes: null,
      reviewedAt: null,
    });

    const saved = await this.kycRepository.save(doc);
    this.logger.log(`KYC submission created: id=${saved.id} userId=${userId} type=${dto.documentType}`);
    return saved;
  }

  // ── Admin: review KYC document ─────────────────────────────────────────────

  /**
   * Admin approves or rejects a pending KYC submission.
   * Once approved the user is eligible to receive a verified credential.
   */
  async reviewKycDocument(
    adminId: string,
    kycId: string,
    dto: ReviewKycDocumentDto,
  ): Promise<KycDocument> {
    const doc = await this.kycRepository.findOne({ where: { id: kycId } });

    if (!doc) {
      throw new NotFoundException(`KYC submission "${kycId}" not found.`);
    }

    if (doc.status !== KycStatus.PENDING) {
      throw new BadRequestException(
        `KYC submission is already in "${doc.status}" state and cannot be reviewed again.`,
      );
    }

    if (dto.decision === KycReviewDecision.REJECTED && !dto.reviewerNotes) {
      throw new BadRequestException(
        'Reviewer notes are required when rejecting a KYC submission.',
      );
    }

    doc.status =
      dto.decision === KycReviewDecision.APPROVED
        ? KycStatus.APPROVED
        : KycStatus.REJECTED;
    doc.reviewedBy = adminId;
    doc.reviewerNotes = dto.reviewerNotes ?? null;
    doc.reviewedAt = new Date();

    const saved = await this.kycRepository.save(doc);
    this.logger.log(
      `KYC submission ${kycId} ${doc.status} by admin=${adminId}`,
    );
    return saved;
  }

  // ── Admin: list all pending KYC submissions ────────────────────────────────

  /**
   * Returns all KYC submissions in PENDING status, oldest first.
   * Used by the admin review queue.
   */
  async listPendingKycSubmissions(): Promise<KycDocument[]> {
    return this.kycRepository.find({
      where: { status: KycStatus.PENDING },
      order: { submittedAt: 'ASC' },
    });
  }

  // ── issue_verified_credential ─────────────────────────────────────────────

  /**
   * Admin issues a decentralized identity credential for a user whose KYC
   * has been approved.
   *
   * The issued credential has the form:
   *   did:lumentix:<uuid>
   *
   * and can be verified at any Lumentix event without the user re-submitting
   * their documents (cross-event reuse).
   *
   * Rules enforced:
   *  - Target user must have at least one APPROVED KYC submission.
   *  - User can only hold one active (non-revoked) credential per provider.
   */
  async issueVerifiedCredential(
    issuerId: string,
    dto: IssueVerifiedCredentialDto,
  ): Promise<VerifiedCredential> {
    // Verify the subject has approved KYC
    const approvedKyc = await this.kycRepository.findOne({
      where: { userId: dto.subjectUserId, status: KycStatus.APPROVED },
    });

    if (!approvedKyc) {
      throw new BadRequestException(
        'User does not have an approved KYC submission. ' +
          'Approve a KYC document before issuing a verified credential.',
      );
    }

    // Prevent duplicate active credentials per provider
    const existingActive = await this.credentialRepository.findOne({
      where: { userId: dto.subjectUserId, provider: dto.provider, revoked: false },
    });

    if (existingActive) {
      throw new ConflictException(
        'An active verified credential already exists for this user and provider. ' +
          'Revoke the existing credential before issuing a new one.',
      );
    }

    // Auto-generate DID if not supplied: did:lumentix:<uuid>
    const did = dto.did ?? `did:lumentix:${crypto.randomUUID()}`;

    // Parse optional expiry
    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (isNaN(expiresAt.getTime())) {
        throw new BadRequestException(
          `Invalid expiresAt value: "${dto.expiresAt}". Use an ISO 8601 date string.`,
        );
      }
      if (expiresAt <= new Date()) {
        throw new BadRequestException('expiresAt must be a future date.');
      }
    }

    const credential = this.credentialRepository.create({
      userId: dto.subjectUserId,
      did,
      provider: dto.provider,
      metadata: dto.metadata ?? null,
      revoked: false,
      revokedReason: null,
      expiresAt,
      issuedBy: issuerId,
    });

    const saved = await this.credentialRepository.save(credential);
    this.logger.log(
      `Credential issued: id=${saved.id} did=${did} userId=${dto.subjectUserId} issuedBy=${issuerId}`,
    );
    return saved;
  }

  // ── verify_did_credential ─────────────────────────────────────────────────

  /**
   * Verifies that a specific credential:
   *  1. Exists
   *  2. Belongs to the requesting user
   *  3. Has not been revoked
   *  4. Has not expired
   *
   * This is the primary cross-event reuse check: an organizer calls this once
   * per event check-in and gets a definitive valid/invalid answer without
   * requiring the user to re-upload documents.
   */
  async verifyDidCredential(
    userId: string,
    credentialId: string,
  ): Promise<VerifyCredentialResult> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential "${credentialId}" not found.`);
    }

    if (credential.userId !== userId) {
      throw new ForbiddenException(
        'This credential does not belong to the requesting user.',
      );
    }

    if (credential.revoked) {
      return {
        valid: false,
        reason: `Credential has been revoked${credential.revokedReason ? ': ' + credential.revokedReason : '.'}`,
        credential,
      };
    }

    if (credential.expiresAt && credential.expiresAt < new Date()) {
      return {
        valid: false,
        reason: `Credential expired on ${credential.expiresAt.toISOString()}.`,
        credential,
      };
    }

    return { valid: true, credential };
  }

  /**
   * Verify a credential directly by its DID string rather than its UUID.
   * Useful for NFC/QR flows where only the DID is presented.
   */
  async verifyDidCredentialByDid(
    did: string,
    userId: string,
  ): Promise<VerifyCredentialResult> {
    const credential = await this.credentialRepository.findOne({ where: { did } });

    if (!credential) {
      throw new NotFoundException(`No credential found for DID "${did}".`);
    }

    // Delegate the remaining ownership + status checks to the main verifier
    return this.verifyDidCredential(userId, credential.id);
  }

  // ── check_event_credential (cross-event reuse) ────────────────────────────

  /**
   * Checks whether a user holds any valid verified credential.
   * Called by event organizers at check-in to confirm KYC compliance
   * WITHOUT requiring the user to re-submit documents for each event.
   *
   * By default only LUMENTIX-issued credentials are accepted; pass
   * `acceptAnyProvider = true` to accept third-party credentials too.
   */
  async checkEventCredential(
    dto: CheckEventCredentialDto,
  ): Promise<EventCredentialCheckResult> {
    const providerFilter = dto.acceptAnyProvider
      ? undefined
      : CredentialProvider.LUMENTIX;

    const query = this.credentialRepository
      .createQueryBuilder('vc')
      .where('vc.userId = :userId', { userId: dto.userId })
      .andWhere('vc.revoked = :revoked', { revoked: false })
      .andWhere('(vc.expiresAt IS NULL OR vc.expiresAt > NOW())');

    if (providerFilter) {
      query.andWhere('vc.provider = :provider', { provider: providerFilter });
    }

    const credential = await query
      .orderBy('vc.issuedAt', 'DESC')
      .getOne();

    if (!credential) {
      const providerLabel = dto.acceptAnyProvider ? 'any provider' : 'LUMENTIX';
      return {
        verified: false,
        reason: `No active verified credential found for user (provider: ${providerLabel}).`,
        credential: null,
      };
    }

    return {
      verified: true,
      reason: 'User holds a valid verified credential and passes KYC check.',
      credential,
    };
  }

  // ── Admin: revoke credential ───────────────────────────────────────────────

  /**
   * Revokes a previously issued credential.
   * Once revoked the credential fails all future verification checks.
   */
  async revokeCredential(
    adminId: string,
    credentialId: string,
    dto: RevokeCredentialDto,
  ): Promise<VerifiedCredential> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential "${credentialId}" not found.`);
    }

    if (credential.revoked) {
      throw new ConflictException('Credential is already revoked.');
    }

    credential.revoked = true;
    credential.revokedReason = dto.reason ?? null;

    const saved = await this.credentialRepository.save(credential);
    this.logger.warn(
      `Credential revoked: id=${credentialId} by admin=${adminId} reason="${dto.reason ?? 'none'}"`,
    );
    return saved;
  }

  // ── User-facing list helpers ───────────────────────────────────────────────

  /**
   * Returns all KYC submissions for the authenticated user.
   */
  async getKycSubmissions(userId: string): Promise<KycDocument[]> {
    return this.kycRepository.find({
      where: { userId },
      order: { submittedAt: 'DESC' },
    });
  }

  /**
   * Returns all verified credentials issued to the authenticated user.
   */
  async getUserCredentials(userId: string): Promise<VerifiedCredential[]> {
    return this.credentialRepository.find({
      where: { userId },
      order: { issuedAt: 'DESC' },
    });
  }
}
