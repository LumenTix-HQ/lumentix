import { Test, TestingModule } from '@nestjs/testing';
import { ZkpService } from './zkp.service';
import { BadRequestException } from '@nestjs/common';

describe('ZkpService', () => {
  let service: ZkpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ZkpService],
    }).compile();

    service = module.get<ZkpService>(ZkpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generate_age_proof', () => {
    it('should generate a valid proof for a valid birth year', () => {
      const currentYear = new Date().getFullYear();
      const result = service.generate_age_proof('user1', currentYear - 25, 18);

      expect(result.proof).toBeDefined();
      expect(result.minimumAge).toBe(18);
      expect(result.generated).toBe(true);
    });

    it('should throw BadRequestException for negative age', () => {
      expect(() =>
        service.generate_age_proof('user1', new Date().getFullYear() + 5, 18),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for age > 150', () => {
      expect(() =>
        service.generate_age_proof('user1', 1800, 18),
      ).toThrow(BadRequestException);
    });
  });

  describe('verify_age_proof', () => {
    it('should return valid for a correct proof', () => {
      const currentYear = new Date().getFullYear();
      const { proof } = service.generate_age_proof('user1', currentYear - 25, 18);
      const result = service.verify_age_proof(proof, 18);

      expect(result.valid).toBe(true);
      expect(result.minimumAge).toBe(18);
    });

    it('should return invalid for a tampered proof', () => {
      const tampered = Buffer.from(JSON.stringify({ userId: 'user1', ageGte: 18, valid: false })).toString('base64');
      const result = service.verify_age_proof(tampered, 18);

      expect(result.valid).toBe(false);
    });

    it('should return invalid for garbage base64', () => {
      const result = service.verify_age_proof('not-valid-base64!!!', 18);
      expect(result.valid).toBe(false);
    });
  });

  describe('register_zkp_verifier', () => {
    it('should register a verifier', () => {
      const result = service.register_zkp_verifier('v1', 'AgeVerifier');
      expect(result.verifierId).toBe('v1');
      expect(result.name).toBe('AgeVerifier');
      expect(result.registered).toBe(true);
    });
  });
});
