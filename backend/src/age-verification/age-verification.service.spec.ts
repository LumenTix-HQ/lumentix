import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { AgeProofService } from './age-verification.service';
import { AgeProofVerifier } from './entities/age-proof-verifier.entity';
import { KycDocument, KycStatus } from '../identity/entities/kyc-document.entity';

const SECRET = 'unit-test-signing-secret-unit-test-signing-secret';

const sign = (encodedPayload: string): string =>
  createHmac('sha256', SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('AgeProofService', () => {
  let service: AgeProofService;
  let kycRepository: { findOne: jest.Mock };
  let verifierRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    kycRepository = { findOne: jest.fn() };
    verifierRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, registeredAt: new Date() }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgeProofService,
        { provide: getRepositoryToken(KycDocument), useValue: kycRepository },
        {
          provide: getRepositoryToken(AgeProofVerifier),
          useValue: verifierRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ZKP_SIGNING_SECRET' ? SECRET : undefined,
          },
        },
      ],
    }).compile();

    service = module.get<AgeProofService>(AgeProofService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAgeProof', () => {
    it('derives age from the verified KYC record and issues a signed proof', async () => {
      kycRepository.findOne.mockResolvedValue({
        userId: 'user1',
        status: KycStatus.APPROVED,
        dateOfBirth: `${new Date().getUTCFullYear() - 25}-01-01`,
      });

      const result = await service.generateAgeProof('user1', 18);

      expect(kycRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user1', status: KycStatus.APPROVED },
        }),
      );
      expect(result.generated).toBe(true);
      expect(result.minimumAge).toBe(18);
      expect(result.proof.split('.')).toHaveLength(3);
      expect(service.verifyAgeProof(result.proof, 18).valid).toBe(true);
    });

    it('throws when the user has no approved identity record', async () => {
      kycRepository.findOne.mockResolvedValue(null);
      await expect(service.generateAgeProof('user1', 18)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the verified age is below the requested minimum', async () => {
      kycRepository.findOne.mockResolvedValue({
        userId: 'user1',
        status: KycStatus.APPROVED,
        dateOfBirth: `${new Date().getUTCFullYear() - 15}-01-01`,
      });
      await expect(service.generateAgeProof('user1', 18)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('verifyAgeProof', () => {
    beforeEach(() => {
      kycRepository.findOne.mockResolvedValue({
        userId: 'user1',
        status: KycStatus.APPROVED,
        dateOfBirth: `${new Date().getUTCFullYear() - 30}-01-01`,
      });
    });

    it('rejects a forged proof that claims a higher age threshold', async () => {
      const { proof } = await service.generateAgeProof('user1', 18);
      const [version, , signature] = proof.split('.');
      const forgedPayload = encode({
        sub: 'user1',
        ageGte: 21,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      const forged = `${version}.${forgedPayload}.${signature}`;

      expect(service.verifyAgeProof(forged, 21).valid).toBe(false);
    });

    it('rejects a proof signed with the wrong secret', async () => {
      const payload = encode({
        sub: 'user1',
        ageGte: 21,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      const bogusSignature = createHmac('sha256', 'attacker-secret')
        .update(payload)
        .digest('base64');

      expect(service.verifyAgeProof(`v1.${payload}.${bogusSignature}`, 21).valid).toBe(
        false,
      );
    });

    it('rejects an expired proof', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = encode({
        sub: 'user1',
        ageGte: 21,
        iat: now - 1200,
        exp: now - 600,
      });
      expect(service.verifyAgeProof(`v1.${payload}.${sign(payload)}`, 21).valid).toBe(
        false,
      );
    });

    it('rejects garbage input', () => {
      expect(service.verifyAgeProof('not-a-proof', 18).valid).toBe(false);
    });
  });

  describe('registerVerifier', () => {
    it('persists a verifier', async () => {
      const result = await service.registerVerifier('v1', 'AgeVerifier', 'admin-1');
      expect(verifierRepository.save).toHaveBeenCalled();
      expect(result.verifierId).toBe('v1');
      expect(result.name).toBe('AgeVerifier');
      expect(result.registered).toBe(true);
    });

    it('rejects a duplicate verifier', async () => {
      verifierRepository.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.registerVerifier('v1', 'AgeVerifier', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
