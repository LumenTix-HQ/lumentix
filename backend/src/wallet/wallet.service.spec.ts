import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { UsersService } from '../users/users.service';
import { StellarService } from '../stellar/stellar.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { REDIS_CLIENT } from '../common/redis/redis.provider';
import { BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';

describe('WalletService', () => {
  let walletService: WalletService;
  let usersService: any;
  let stellarService: any;
  let usersRepository: any;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: UsersService,
          useValue: { updateWallet: jest.fn() },
        },
        {
          provide: StellarService,
          useValue: { getAccount: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: REDIS_CLIENT,
          useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    walletService = module.get<WalletService>(WalletService);
    usersService = module.get(UsersService);
    stellarService = module.get(StellarService);
    usersRepository = module.get(getRepositoryToken(User));
    redis = module.get(REDIS_CLIENT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const validKp = Keypair.random();
  const validPublicKey = validKp.publicKey();

  describe('requestChallenge', () => {
    it('should throw BadRequestException for invalid public key', async () => {
      await expect(walletService.requestChallenge('invalid')).rejects.toThrow(BadRequestException);
    });

    it('should store nonce and return message', async () => {
      const result = await walletService.requestChallenge(validPublicKey);
      expect(result.message).toContain('Sign this message to link wallet:');
      expect(redis.set).toHaveBeenCalledWith(`wallet:nonce:${validPublicKey}`, expect.any(String), 'EX', 300);
    });
  });

  describe('verifyAndLink', () => {
    const userId = 'user-1';

    it('should throw BadRequestException if invalid public key', async () => {
      await expect(walletService.verifyAndLink(userId, 'invalid', 'sig')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no active challenge', async () => {
      redis.get.mockResolvedValue(null);
      await expect(walletService.verifyAndLink(userId, validPublicKey, 'sig')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if signature is invalid', async () => {
      redis.get.mockResolvedValue('nonce');
      await expect(walletService.verifyAndLink(userId, validPublicKey, 'invalid-sig')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException if public key is linked to another user', async () => {
      const nonce = 'my-nonce';
      redis.get.mockResolvedValue(nonce);
      
      const message = `Sign this message to link wallet: ${nonce}`;
      const validSignature = validKp.sign(Buffer.from(message)).toString('hex');
      
      usersRepository.findOne.mockResolvedValue({ id: 'user-2', stellarPublicKey: validPublicKey });

      await expect(walletService.verifyAndLink(userId, validPublicKey, validSignature)).rejects.toThrow(ConflictException);
    });

    it('should update and return user if successful', async () => {
      const nonce = 'my-nonce';
      redis.get.mockResolvedValue(nonce);
      
      const message = `Sign this message to link wallet: ${nonce}`;
      const validSignature = validKp.sign(Buffer.from(message)).toString('hex');
      
      usersRepository.findOne.mockResolvedValue(null);
      stellarService.getAccount.mockResolvedValue({});
      usersService.updateWallet.mockResolvedValue({ id: userId, stellarPublicKey: validPublicKey });

      const result = await walletService.verifyAndLink(userId, validPublicKey, validSignature);

      expect(result).toEqual({ id: userId, stellarPublicKey: validPublicKey });
      expect(redis.del).toHaveBeenCalledWith(`wallet:nonce:${validPublicKey}`);
      expect(usersService.updateWallet).toHaveBeenCalledWith(userId, validPublicKey);
    });
  });
});
