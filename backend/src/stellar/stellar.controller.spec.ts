import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';

describe('StellarController', () => {
  let controller: StellarController;
  let stellarService: { getAccount: jest.Mock };

  const VALID_PUBLIC_KEY = `G${'A'.repeat(55)}`;

  beforeEach(async () => {
    stellarService = {
      getAccount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StellarController],
      providers: [{ provide: StellarService, useValue: stellarService }],
    }).compile();

    controller = module.get<StellarController>(StellarController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('registers JwtAuthGuard on the controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StellarController) as
      | Array<new (...args: any[]) => unknown>
      | undefined;

    expect(guards).toContain(JwtAuthGuard);
  });

  it('returns the account response in the expected shape', async () => {
    const balances = [{ asset_type: 'native', balance: '42.0000000' }];
    stellarService.getAccount.mockResolvedValue({
      id: VALID_PUBLIC_KEY,
      sequence: '123456789',
      balances,
      last_modified_ledger: 987654,
    });

    await expect(controller.getAccount(VALID_PUBLIC_KEY)).resolves.toEqual({
      publicKey: VALID_PUBLIC_KEY,
      sequence: '123456789',
      balances,
      lastModifiedLedger: 987654,
    });
    expect(stellarService.getAccount).toHaveBeenCalledWith(VALID_PUBLIC_KEY);
  });

  it('rejects invalid Stellar public keys', async () => {
    await expect(controller.getAccount('invalid-key')).rejects.toThrow(
      new BadRequestException('Invalid Stellar public key format'),
    );
    expect(stellarService.getAccount).not.toHaveBeenCalled();
  });

  it('maps Horizon 404 errors to NotFoundException', async () => {
    stellarService.getAccount.mockRejectedValue({ response: { status: 404 } });

    await expect(controller.getAccount(VALID_PUBLIC_KEY)).rejects.toThrow(
      new NotFoundException('Stellar account not found'),
    );
  });

  it('maps other Horizon errors to BadRequestException', async () => {
    stellarService.getAccount.mockRejectedValue({ response: { status: 500 } });

    await expect(controller.getAccount(VALID_PUBLIC_KEY)).rejects.toThrow(
      new BadRequestException('Could not fetch account from Horizon'),
    );
  });
});
