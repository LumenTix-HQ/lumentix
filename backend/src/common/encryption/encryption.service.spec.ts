import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { LocalEncryptionProvider } from './providers/local-encryption.provider';
import { ENCRYPTION_PROVIDER } from './encryption.service';

const ENCRYPTION_SECRET = 'test-encryption-secret-for-sha256-derivation!';

describe('EncryptionModule', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ENCRYPTION_PROVIDER,
          useFactory: (configService: ConfigService) =>
            new LocalEncryptionProvider(configService),
          inject: [ConfigService],
        },
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ESCROW_ENCRYPTION_SECRET') return ENCRYPTION_SECRET;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(EncryptionService);
  });

  describe('LocalEncryptionProvider', () => {
    const plaintext = 'SESCROW_SECRET_STELLAR_KEY_ABC123';

    it('encrypts to a colon-delimited string with 3 parts', () => {
      const result = service.encrypt(plaintext);
      expect(result.split(':').length).toBe(3);
    });

    it('decrypts back to the original plaintext', () => {
      const encrypted = service.encrypt(plaintext);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const a = service.encrypt(plaintext);
      const b = service.encrypt(plaintext);
      expect(a).not.toBe(b);
    });

    it('throws when the ciphertext is tampered with', () => {
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(':');
      parts[2] = parts[2].replace(/^../, 'ff'); // corrupt ciphertext
      expect(() => service.decrypt(parts.join(':'))).toThrow();
    });

    it('throws with wrong decryption secret', () => {
      // Re-create service with a different secret
      const encrypted = service.encrypt(plaintext);
      const wrongModule = new LocalEncryptionProvider(
        new (class extends ConfigService {
          get() {
            return 'different-secret';
          }
        })(),
      );
      expect(() => wrongModule.decrypt(encrypted)).toThrow();
    });

    it('throws on malformed encrypted value', () => {
      expect(() => service.decrypt('not-valid')).toThrow(
        'Invalid encrypted value format.',
      );
    });

    it('backward compatible with existing encryption.util.ts format', () => {
      // Encrypt and decrypt should work with same format as before
      const encrypted = service.encrypt(plaintext);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });
});
