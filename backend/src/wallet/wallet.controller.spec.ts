import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { BadRequestException } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: {
            getWalletStatus: jest.fn(),
            getTransactionHistory: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
    walletService = module.get(WalletService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTransactions', () => {
    const mockRequest = {
      user: { id: 'user-1' },
    } as AuthenticatedRequest;

    it('should throw BadRequestException if no wallet is linked', async () => {
      walletService.getWalletStatus.mockResolvedValue({ linked: false, publicKey: null });

      await expect(
        controller.getTransactions(mockRequest),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return transaction history with cursor and limit', async () => {
      const mockPublicKey = 'GBRPYHIL2CI3WHZDTOOQFC6EB4PSQJNLCCF33TTTKHC7OZLSWHDPMP7';
      const mockTransactions = [
        { paging_token: 'token-1', id: 'tx-1' },
        { paging_token: 'token-2', id: 'tx-2' },
      ];

      walletService.getWalletStatus.mockResolvedValue({
        linked: true,
        publicKey: mockPublicKey,
      });
      walletService.getTransactionHistory.mockResolvedValue({
        transactions: mockTransactions,
        nextCursor: 'token-2',
      });

      const result = await controller.getTransactions(mockRequest, 'cursor-token', 20);

      expect(result).toEqual({
        transactions: mockTransactions,
        nextCursor: 'token-2',
      });
      expect(walletService.getTransactionHistory).toHaveBeenCalledWith(
        mockPublicKey,
        'cursor-token',
        20,
      );
    });

    it('should use default limit when not provided', async () => {
      const mockPublicKey = 'GBRPYHIL2CI3WHZDTOOQFC6EB4PSQJNLCCF33TTTKHC7OZLSWHDPMP7';
      walletService.getWalletStatus.mockResolvedValue({
        linked: true,
        publicKey: mockPublicKey,
      });
      walletService.getTransactionHistory.mockResolvedValue({
        transactions: [],
        nextCursor: null,
      });

      await controller.getTransactions(mockRequest);

      expect(walletService.getTransactionHistory).toHaveBeenCalledWith(
        mockPublicKey,
        undefined,
        10,
      );
    });

    it('should convert limit to number', async () => {
      const mockPublicKey = 'GBRPYHIL2CI3WHZDTOOQFC6EB4PSQJNLCCF33TTTKHC7OZLSWHDPMP7';
      walletService.getWalletStatus.mockResolvedValue({
        linked: true,
        publicKey: mockPublicKey,
      });
      walletService.getTransactionHistory.mockResolvedValue({
        transactions: [],
        nextCursor: null,
      });

      await controller.getTransactions(mockRequest, undefined, 25);

      expect(walletService.getTransactionHistory).toHaveBeenCalledWith(
        mockPublicKey,
        undefined,
        25,
      );
    });
  });
});
