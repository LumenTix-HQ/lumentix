import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IdentityService } from './identity.service';
import { KycDocument, KycStatus } from './entities/kyc-document.entity';
import { VerifiedCredential } from './entities/verified-credential.entity';
import {
  CheckEventCredentialDto,
  CredentialProvider,
  DocumentType,
  IssueVerifiedCredentialDto,
  KycReviewDecision,
  ReviewKycDocumentDto,
  RevokeCredentialDto,
  SubmitKycDocumentsDto,
} from './dto/kyc.dto';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const ADMIN_ID = 'admin-uuid-1';
const KYC_ID = 'kyc-uuid-1';
const CRED_ID = 'cred-uuid-1';
const TEST_DID = 'did:lumentix:test-uuid';

const makeKycDoc = (overrides: Partial<KycDocument> = {}): KycDocument =>
  ({
    id: KYC_ID,
    userId: USER_ID,
    documentType: DocumentType.PASSPORT,
    documentNumber: 'AB123456',
    documentUrl: null,
    fullName: 'Jane Doe',
    dateOfBirth: '1990-01-01',
    countryCode: 'US',
    status: KycStatus.PENDING,
    reviewedBy: null,
    reviewerNotes: null,
    reviewedAt: null,
    submittedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as KycDocument;

const makeCredential = (
  overrides: Partial<VerifiedCredential> = {},
): VerifiedCredential =>
  ({
    id: CRED_ID,
    userId: USER_ID,
    did: TEST_DID,
    provider: CredentialProvider.LUMENTIX,
    metadata: null,
    revoked: false,
    revokedReason: null,
    expiresAt: null,
    issuedBy: ADMIN_ID,
    issuedAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    ...overrides,
  }) as VerifiedCredential;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a chainable QueryBuilder mock that resolves getOne() to `result`. */
const makeQb = (result: VerifiedCredential | null) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IdentityService', () => {
  let service: IdentityService;

  let kycRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };

  let credRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    kycRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      find: jest.fn(),
    };

    credRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: getRepositoryToken(KycDocument), useValue: kycRepo },
        { provide: getRepositoryToken(VerifiedCredential), useValue: credRepo },
      ],
    }).compile();

    service = module.get<IdentityService>(IdentityService);
  });

  // ── submitKycDocuments ────────────────────────────────────────────────────

  describe('submitKycDocuments', () => {
    const dto: SubmitKycDocumentsDto = {
      documentType: DocumentType.PASSPORT,
      documentNumber: 'AB123456',
      fullName: 'Jane Doe',
    };

    it('creates and returns a new PENDING KYC document', async () => {
      kycRepo.findOne.mockResolvedValue(null); // no existing pending submission
      const saved = makeKycDoc();
      kycRepo.save.mockResolvedValue(saved);

      const result = await service.submitKycDocuments(USER_ID, dto);

      expect(kycRepo.findOne).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          documentType: dto.documentType,
          status: KycStatus.PENDING,
        },
      });
      expect(result.status).toBe(KycStatus.PENDING);
      expect(result.userId).toBe(USER_ID);
    });

    it('throws ConflictException when a pending submission already exists', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc());

      await expect(service.submitKycDocuments(USER_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows a new submission when the existing one is APPROVED (not PENDING)', async () => {
      // findOne for PENDING returns null → no conflict
      kycRepo.findOne.mockResolvedValue(null);
      const saved = makeKycDoc();
      kycRepo.save.mockResolvedValue(saved);

      await expect(service.submitKycDocuments(USER_ID, dto)).resolves.toBeDefined();
    });
  });

  // ── reviewKycDocument ─────────────────────────────────────────────────────

  describe('reviewKycDocument', () => {
    it('approves a pending submission', async () => {
      const doc = makeKycDoc();
      kycRepo.findOne.mockResolvedValue(doc);
      kycRepo.save.mockImplementation(async (d: KycDocument) => d);

      const dto: ReviewKycDocumentDto = { decision: KycReviewDecision.APPROVED };
      const result = await service.reviewKycDocument(ADMIN_ID, KYC_ID, dto);

      expect(result.status).toBe(KycStatus.APPROVED);
      expect(result.reviewedBy).toBe(ADMIN_ID);
      expect(result.reviewedAt).toBeInstanceOf(Date);
    });

    it('rejects a pending submission with reviewer notes', async () => {
      const doc = makeKycDoc();
      kycRepo.findOne.mockResolvedValue(doc);
      kycRepo.save.mockImplementation(async (d: KycDocument) => d);

      const dto: ReviewKycDocumentDto = {
        decision: KycReviewDecision.REJECTED,
        reviewerNotes: 'Document expired.',
      };
      const result = await service.reviewKycDocument(ADMIN_ID, KYC_ID, dto);

      expect(result.status).toBe(KycStatus.REJECTED);
      expect(result.reviewerNotes).toBe('Document expired.');
    });

    it('throws BadRequestException when rejecting without reviewer notes', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc());

      const dto: ReviewKycDocumentDto = {
        decision: KycReviewDecision.REJECTED,
        // no reviewerNotes
      };

      await expect(
        service.reviewKycDocument(ADMIN_ID, KYC_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when submission is already reviewed', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc({ status: KycStatus.APPROVED }));

      await expect(
        service.reviewKycDocument(ADMIN_ID, KYC_ID, {
          decision: KycReviewDecision.APPROVED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown KYC id', async () => {
      kycRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reviewKycDocument(ADMIN_ID, 'unknown', {
          decision: KycReviewDecision.APPROVED,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── issueVerifiedCredential ───────────────────────────────────────────────

  describe('issueVerifiedCredential', () => {
    const baseDto: IssueVerifiedCredentialDto = {
      subjectUserId: USER_ID,
      provider: CredentialProvider.LUMENTIX,
    };

    it('issues a credential with an auto-generated DID when none is supplied', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc({ status: KycStatus.APPROVED }));
      credRepo.findOne.mockResolvedValue(null); // no existing active credential
      const saved = makeCredential();
      credRepo.save.mockResolvedValue(saved);

      const result = await service.issueVerifiedCredential(ADMIN_ID, baseDto);

      expect(result).toBeDefined();
      // create() was called with a did that looks like did:lumentix:...
      const createCall = credRepo.create.mock.calls[0][0];
      expect(createCall.did).toMatch(/^did:lumentix:/);
    });

    it('uses the supplied DID when provided', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc({ status: KycStatus.APPROVED }));
      credRepo.findOne.mockResolvedValue(null);
      credRepo.save.mockResolvedValue(makeCredential({ did: 'did:lumentix:custom' }));

      await service.issueVerifiedCredential(ADMIN_ID, {
        ...baseDto,
        did: 'did:lumentix:custom',
      });

      const createCall = credRepo.create.mock.calls[0][0];
      expect(createCall.did).toBe('did:lumentix:custom');
    });

    it('sets expiresAt when a valid future date is provided', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc({ status: KycStatus.APPROVED }));
      credRepo.findOne.mockResolvedValue(null);
      credRepo.save.mockImplementation(async (c: VerifiedCredential) => c);

      const expiresAt = '2099-01-01T00:00:00Z';
      await service.issueVerifiedCredential(ADMIN_ID, { ...baseDto, expiresAt });

      const createCall = credRepo.create.mock.calls[0][0];
      expect(createCall.expiresAt).toBeInstanceOf(Date);
    });

    it('throws BadRequestException when no approved KYC exists', async () => {
      kycRepo.findOne.mockResolvedValue(null);

      await expect(
        service.issueVerifiedCredential(ADMIN_ID, baseDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when an active credential already exists', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc({ status: KycStatus.APPROVED }));
      credRepo.findOne.mockResolvedValue(makeCredential()); // already active

      await expect(
        service.issueVerifiedCredential(ADMIN_ID, baseDto),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for an invalid expiresAt string', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc({ status: KycStatus.APPROVED }));
      credRepo.findOne.mockResolvedValue(null);

      await expect(
        service.issueVerifiedCredential(ADMIN_ID, {
          ...baseDto,
          expiresAt: 'not-a-date',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when expiresAt is in the past', async () => {
      kycRepo.findOne.mockResolvedValue(makeKycDoc({ status: KycStatus.APPROVED }));
      credRepo.findOne.mockResolvedValue(null);

      await expect(
        service.issueVerifiedCredential(ADMIN_ID, {
          ...baseDto,
          expiresAt: '2000-01-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── verifyDidCredential ───────────────────────────────────────────────────

  describe('verifyDidCredential', () => {
    it('returns valid=true for an active, non-expired credential', async () => {
      credRepo.findOne.mockResolvedValue(makeCredential());

      const result = await service.verifyDidCredential(USER_ID, CRED_ID);

      expect(result.valid).toBe(true);
      expect(result.credential.id).toBe(CRED_ID);
    });

    it('returns valid=false with reason for a revoked credential', async () => {
      credRepo.findOne.mockResolvedValue(
        makeCredential({ revoked: true, revokedReason: 'Fraud detected.' }),
      );

      const result = await service.verifyDidCredential(USER_ID, CRED_ID);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('revoked');
      expect(result.reason).toContain('Fraud detected.');
    });

    it('returns valid=false with reason for an expired credential', async () => {
      const pastDate = new Date('2020-01-01');
      credRepo.findOne.mockResolvedValue(
        makeCredential({ expiresAt: pastDate }),
      );

      const result = await service.verifyDidCredential(USER_ID, CRED_ID);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('throws ForbiddenException when credential belongs to a different user', async () => {
      credRepo.findOne.mockResolvedValue(
        makeCredential({ userId: 'other-user-id' }),
      );

      await expect(
        service.verifyDidCredential(USER_ID, CRED_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for an unknown credential id', async () => {
      credRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyDidCredential(USER_ID, 'unknown'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── verifyDidCredentialByDid ──────────────────────────────────────────────

  describe('verifyDidCredentialByDid', () => {
    it('resolves a valid credential by DID string', async () => {
      const cred = makeCredential();
      // First findOne: DID lookup; second findOne: id lookup inside verifyDidCredential
      credRepo.findOne
        .mockResolvedValueOnce(cred)  // DID lookup
        .mockResolvedValueOnce(cred); // id lookup

      const result = await service.verifyDidCredentialByDid(TEST_DID, USER_ID);

      expect(result.valid).toBe(true);
    });

    it('throws NotFoundException when no credential matches the DID', async () => {
      credRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyDidCredentialByDid('did:lumentix:unknown', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── checkEventCredential ──────────────────────────────────────────────────

  describe('checkEventCredential', () => {
    it('returns verified=true when the user has an active LUMENTIX credential', async () => {
      const cred = makeCredential();
      const qb = makeQb(cred);
      credRepo.createQueryBuilder.mockReturnValue(qb);

      const dto: CheckEventCredentialDto = { userId: USER_ID };
      const result = await service.checkEventCredential(dto);

      expect(result.verified).toBe(true);
      expect(result.credential?.id).toBe(CRED_ID);
      // provider filter applied because acceptAnyProvider was not set
      expect(qb.andWhere).toHaveBeenCalledWith(
        'vc.provider = :provider',
        { provider: CredentialProvider.LUMENTIX },
      );
    });

    it('returns verified=false when no credential is found', async () => {
      credRepo.createQueryBuilder.mockReturnValue(makeQb(null));

      const result = await service.checkEventCredential({ userId: USER_ID });

      expect(result.verified).toBe(false);
      expect(result.credential).toBeNull();
    });

    it('omits the provider filter when acceptAnyProvider=true', async () => {
      const cred = makeCredential({ provider: CredentialProvider.THIRD_PARTY });
      const qb = makeQb(cred);
      credRepo.createQueryBuilder.mockReturnValue(qb);

      const dto: CheckEventCredentialDto = {
        userId: USER_ID,
        acceptAnyProvider: true,
      };
      const result = await service.checkEventCredential(dto);

      expect(result.verified).toBe(true);
      // andWhere should NOT have been called with a provider filter
      const providerFilterCalls = (qb.andWhere.mock.calls as string[][]).filter(
        (args) => String(args[0]).includes('provider'),
      );
      expect(providerFilterCalls).toHaveLength(0);
    });
  });

  // ── revokeCredential ──────────────────────────────────────────────────────

  describe('revokeCredential', () => {
    it('revokes a valid credential and stores the reason', async () => {
      const cred = makeCredential();
      credRepo.findOne.mockResolvedValue(cred);
      credRepo.save.mockImplementation(async (c: VerifiedCredential) => c);

      const dto: RevokeCredentialDto = { reason: 'Account compromised.' };
      const result = await service.revokeCredential(ADMIN_ID, CRED_ID, dto);

      expect(result.revoked).toBe(true);
      expect(result.revokedReason).toBe('Account compromised.');
    });

    it('revokes without a reason when none is supplied', async () => {
      const cred = makeCredential();
      credRepo.findOne.mockResolvedValue(cred);
      credRepo.save.mockImplementation(async (c: VerifiedCredential) => c);

      const result = await service.revokeCredential(ADMIN_ID, CRED_ID, {});

      expect(result.revoked).toBe(true);
      expect(result.revokedReason).toBeNull();
    });

    it('throws ConflictException when credential is already revoked', async () => {
      credRepo.findOne.mockResolvedValue(makeCredential({ revoked: true }));

      await expect(
        service.revokeCredential(ADMIN_ID, CRED_ID, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for an unknown credential id', async () => {
      credRepo.findOne.mockResolvedValue(null);

      await expect(
        service.revokeCredential(ADMIN_ID, 'unknown', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── listPendingKycSubmissions ──────────────────────────────────────────────

  describe('listPendingKycSubmissions', () => {
    it('returns all PENDING submissions ordered oldest-first', async () => {
      const docs = [makeKycDoc(), makeKycDoc({ id: 'kyc-uuid-2' })];
      kycRepo.find.mockResolvedValue(docs);

      const result = await service.listPendingKycSubmissions();

      expect(kycRepo.find).toHaveBeenCalledWith({
        where: { status: KycStatus.PENDING },
        order: { submittedAt: 'ASC' },
      });
      expect(result).toHaveLength(2);
    });
  });

  // ── getKycSubmissions ─────────────────────────────────────────────────────

  describe('getKycSubmissions', () => {
    it('returns all submissions for a user', async () => {
      const docs = [makeKycDoc()];
      kycRepo.find.mockResolvedValue(docs);

      const result = await service.getKycSubmissions(USER_ID);

      expect(kycRepo.find).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        order: { submittedAt: 'DESC' },
      });
      expect(result).toEqual(docs);
    });
  });

  // ── getUserCredentials ────────────────────────────────────────────────────

  describe('getUserCredentials', () => {
    it('returns all credentials for a user', async () => {
      const creds = [makeCredential()];
      credRepo.find.mockResolvedValue(creds);

      const result = await service.getUserCredentials(USER_ID);

      expect(credRepo.find).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        order: { issuedAt: 'DESC' },
      });
      expect(result).toEqual(creds);
    });
  });
});
