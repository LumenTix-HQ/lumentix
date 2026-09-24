import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycDocument, KycStatus } from './entities/kyc-document.entity';
import { VerifiedCredential } from './entities/verified-credential.entity';
import {
  SubmitKycDocumentsDto,
  IssueVerifiedCredentialDto,
  CredentialProvider,
} from './dto/kyc.dto';

@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(KycDocument)
    private readonly kycRepository: Repository<KycDocument>,

    @InjectRepository(VerifiedCredential)
    private readonly credentialRepository: Repository<VerifiedCredential>,
  ) {}

  /**
   * Submit KYC documents for a user.
   * A user may only have one active (non-rejected) KYC submission per document type at a time.
   */
  async submitKycDocuments(
    userId: string,
    dto: SubmitKycDocumentsDto,
  ): Promise<KycDocument> {
    const existing = await this.kycRepository.findOne({
      where: {
        userId,
        documentType: dto.documentType,
        status: KycStatus.PENDING,
      },
    });

    if (existing) {
      throw new ConflictException(
        'A pending KYC submission already exists for this document type. Wait for it to be reviewed before resubmitting.',
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
    });

    return this.kycRepository.save(doc);
  }

  /**
   * Issue a verified decentralized identity credential to a user.
   * Requires an approved KYC document to exist for the user.
   * A user can only hold one active (non-revoked) credential per provider.
   */
  async issueVerifiedCredential(
    issuerId: string,
    dto: IssueVerifiedCredentialDto,
  ): Promise<VerifiedCredential> {
    const approvedKyc = await this.kycRepository.findOne({
      where: { userId: dto.subjectUserId, status: KycStatus.APPROVED },
    });

    if (!approvedKyc) {
      throw new BadRequestException(
        'User does not have an approved KYC submission. Approve KYC documents before issuing a credential.',
      );
    }

    const existing = await this.credentialRepository.findOne({
      where: {
        userId: dto.subjectUserId,
        provider: dto.provider,
        revoked: false,
      },
    });

    if (existing) {
      throw new ConflictException(
        'An active verified credential already exists for this user and provider.',
      );
    }

    const credential = this.credentialRepository.create({
      userId: dto.subjectUserId,
      did: dto.did ?? null,
      provider: dto.provider,
      metadata: dto.metadata ?? null,
      revoked: false,
      expiresAt: null,
    });

    return this.credentialRepository.save(credential);
  }

  /**
   * Verify that a DID credential is valid for a given user.
   * Checks existence, ownership, and revocation status.
   */
  async verifyDidCredential(
    userId: string,
    credentialId: string,
  ): Promise<{ valid: boolean; credential: VerifiedCredential }> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId },
    });

    if (!credential) {
      throw new NotFoundException(
        `Credential with ID "${credentialId}" not found.`,
      );
    }

    if (credential.userId !== userId) {
      throw new ForbiddenException(
        'This credential does not belong to the requesting user.',
      );
    }

    if (credential.revoked) {
      return { valid: false, credential };
    }

    if (credential.expiresAt && credential.expiresAt < new Date()) {
      return { valid: false, credential };
    }

    return { valid: true, credential };
  }

  /**
   * Retrieve all KYC submissions for a user.
   */
  async getKycSubmissions(userId: string): Promise<KycDocument[]> {
    return this.kycRepository.find({
      where: { userId },
      order: { submittedAt: 'DESC' },
    });
  }

  /**
   * Retrieve all issued credentials for a user.
   */
  async getUserCredentials(userId: string): Promise<VerifiedCredential[]> {
    return this.credentialRepository.find({
      where: { userId },
      order: { issuedAt: 'DESC' },
    });
  }
}
