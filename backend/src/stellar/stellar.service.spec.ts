/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon, Keypair } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const ESCROW_SECRET = Keypair.random().secret();
const ESCROW_PUBLIC = Keypair.fromSecret(ESCROW_SECRET).publicKey();
const DESTINATION = Keypair.random().publicKey();
const USDC_ISSUER = Keypair.random().publicKey();
const EUR_ISSUER = Keypair.random().publicKey();
const LONG_ISSUER = Keypair.random().publicKey();

const mockSubmitTransaction = jest.fn().mockResolvedValue({ hash: 'tx-hash' });

function makeBalances(
  extras: Horizon.HorizonApi.BalanceLine[] = [],
): Horizon.HorizonApi.BalanceLine[] {
  return [
    ...extras,
    {
      asset_type: 'native',
      balance: '100.0000000',
    } as Horizon.HorizonApi.BalanceLine<'native'>,
  ];
}

function makeMockAccount(
  balances: Horizon.HorizonApi.BalanceLine[],
): Horizon.AccountResponse {
  return {
    accountId: () => ESCROW_PUBLIC,
    sequenceNumber: () => '1',
    incrementSequenceNumber: jest.fn(),
    balances,
  } as unknown as Horizon.AccountResponse;
}

const mockLoadAccount = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: mockLoadAccount,
        submitTransaction: mockSubmitTransaction,
        ledgers: () => ({ limit: () => ({ call: jest.fn() }) }),
        payments: () => ({
          cursor: () => ({ stream: jest.fn().mockReturnValue(jest.fn()) }),
        }),
        transactions: () => ({ transaction: () => ({ call: jest.fn() }) }),
      })),
    },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildService(): StellarService {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'stellar.horizonUrl')
        return 'https://horizon-testnet.stellar.org';
      if (key === 'stellar.networkPassphrase')
        return 'Test SDF Network ; September 2015';
      return undefined;
    }),
  } as unknown as ConfigService;

  return new StellarService(configService);
}

/** Extract operations from the transaction passed to submitTransaction */
function capturedOps(): any[] {
  const tx = mockSubmitTransaction.mock.calls[0][0];
  return tx.operations;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StellarService', () => {
  let service: StellarService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractAndValidateMemo', () => {
    it('returns a string memo', () => {
      expect(
        service.extractAndValidateMemo({
          memo: 'payment-123',
        } as Horizon.ServerApi.TransactionRecord),
      ).toBe('payment-123');
    });

    it('trims and returns a string memo', () => {
      expect(
        service.extractAndValidateMemo({
          memo: '  contribution-456  ',
        } as Horizon.ServerApi.TransactionRecord),
      ).toBe('contribution-456');
    });

    it('throws when memo is undefined', () => {
      expect(() =>
        service.extractAndValidateMemo({
          memo: undefined,
        } as Horizon.ServerApi.TransactionRecord),
      ).toThrow(
        new BadRequestException(
          'Transaction is missing a memo. Cannot correlate with a payment or contribution intent.',
        ),
      );
    });

    it('throws when memo is empty', () => {
      expect(() =>
        service.extractAndValidateMemo({
          memo: '   ',
        } as Horizon.ServerApi.TransactionRecord),
      ).toThrow(
        new BadRequestException(
          'Transaction is missing a memo. Cannot correlate with a payment or contribution intent.',
        ),
      );
    });

    it('throws when memo is not a string', () => {
      expect(() =>
        service.extractAndValidateMemo({
          memo: 123,
        } as unknown as Horizon.ServerApi.TransactionRecord),
      ).toThrow(
        new BadRequestException(
          'Transaction is missing a memo. Cannot correlate with a payment or contribution intent.',
        ),
      );
    });
  });

  // ── releaseEscrowFunds ─────────────────────────────────────────────────

  describe('releaseEscrowFunds', () => {
    it('merges account when escrow holds only native XLM', async () => {
      mockLoadAccount.mockResolvedValue(makeMockAccount(makeBalances()));

      await service.releaseEscrowFunds(ESCROW_SECRET, DESTINATION);

      const ops = capturedOps();
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('accountMerge');
      expect(ops[0].destination).toBe(DESTINATION);
    });

    it('sends non-native assets via payment before merging', async () => {
      const usdcBalance = {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: USDC_ISSUER,
        balance: '250.0000000',
      } as unknown as Horizon.HorizonApi.BalanceLine;

      mockLoadAccount.mockResolvedValue(
        makeMockAccount(makeBalances([usdcBalance])),
      );

      await service.releaseEscrowFunds(ESCROW_SECRET, DESTINATION);

      const ops = capturedOps();
      expect(ops).toHaveLength(2);

      // First op: payment for USDC
      expect(ops[0].type).toBe('payment');
      expect(ops[0].destination).toBe(DESTINATION);
      expect(ops[0].amount).toBe('250.0000000');
      expect(ops[0].asset.code).toBe('USDC');
      expect(ops[0].asset.issuer).toBe(USDC_ISSUER);

      // Second op: accountMerge for XLM
      expect(ops[1].type).toBe('accountMerge');
      expect(ops[1].destination).toBe(DESTINATION);
    });

    it('handles multiple non-native assets', async () => {
      const usdcBalance = {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: USDC_ISSUER,
        balance: '100.0000000',
      } as unknown as Horizon.HorizonApi.BalanceLine;

      const eurBalance = {
        asset_type: 'credit_alphanum4',
        asset_code: 'EUR',
        asset_issuer: EUR_ISSUER,
        balance: '50.0000000',
      } as unknown as Horizon.HorizonApi.BalanceLine;

      mockLoadAccount.mockResolvedValue(
        makeMockAccount(makeBalances([usdcBalance, eurBalance])),
      );

      await service.releaseEscrowFunds(ESCROW_SECRET, DESTINATION);

      const ops = capturedOps();
      expect(ops).toHaveLength(3);
      expect(ops[0].type).toBe('payment');
      expect(ops[0].asset.code).toBe('USDC');
      expect(ops[1].type).toBe('payment');
      expect(ops[1].asset.code).toBe('EUR');
      expect(ops[2].type).toBe('accountMerge');
    });

    it('skips non-native assets with zero balance', async () => {
      const emptyUsdc = {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: USDC_ISSUER,
        balance: '0.0000000',
      } as unknown as Horizon.HorizonApi.BalanceLine;

      mockLoadAccount.mockResolvedValue(
        makeMockAccount(makeBalances([emptyUsdc])),
      );

      await service.releaseEscrowFunds(ESCROW_SECRET, DESTINATION);

      const ops = capturedOps();
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('accountMerge');
    });

    it('handles credit_alphanum12 assets', async () => {
      const longAsset = {
        asset_type: 'credit_alphanum12',
        asset_code: 'LONGASSET',
        asset_issuer: LONG_ISSUER,
        balance: '75.0000000',
      } as unknown as Horizon.HorizonApi.BalanceLine;

      mockLoadAccount.mockResolvedValue(
        makeMockAccount(makeBalances([longAsset])),
      );

      await service.releaseEscrowFunds(ESCROW_SECRET, DESTINATION);

      const ops = capturedOps();
      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('payment');
      expect(ops[0].asset.code).toBe('LONGASSET');
      expect(ops[1].type).toBe('accountMerge');
    });

    it('propagates errors from loadAccount', async () => {
      mockLoadAccount.mockRejectedValue(new Error('Account not found'));

      await expect(
        service.releaseEscrowFunds(ESCROW_SECRET, DESTINATION),
      ).rejects.toThrow('Account not found');
    });

    it('propagates errors from submitTransaction', async () => {
      mockLoadAccount.mockResolvedValue(makeMockAccount(makeBalances()));
      mockSubmitTransaction.mockRejectedValue(new Error('tx_failed'));

      await expect(
        service.releaseEscrowFunds(ESCROW_SECRET, DESTINATION),
      ).rejects.toThrow('tx_failed');
    });
  });

  // ── findPaymentPath ────────────────────────────────────────────────────

  describe('findPaymentPath', () => {
    const SOURCE_PUBLIC = Keypair.random().publicKey();

    it('returns path records when paths are available', async () => {
      const mockRecords = [{ source_asset_type: 'native', path: [] }];
      const mockServer = (service as any).server;
      mockServer.strictReceivePaths = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: mockRecords }),
      });

      const result = await service.findPaymentPath(SOURCE_PUBLIC, 'XLM', 'USDC', '10');

      expect(result).toEqual(mockRecords);
      expect(mockServer.strictReceivePaths).toHaveBeenCalled();
    });

    it('throws BadRequestException when no paths are found', async () => {
      const mockServer = (service as any).server;
      mockServer.strictReceivePaths = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [] }),
      });

      await expect(
        service.findPaymentPath(SOURCE_PUBLIC, 'XLM', 'USDC', '10'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── buildPathPaymentXdr ────────────────────────────────────────────────

  describe('buildPathPaymentXdr', () => {
    it('returns a valid XDR string', async () => {
      const { Asset: ActualAsset } = jest.requireActual('@stellar/stellar-sdk');
      mockLoadAccount.mockResolvedValue(
        makeMockAccount(makeBalances()),
      );

      const xdr = await service.buildPathPaymentXdr({
        sourcePublicKey: ESCROW_PUBLIC,
        sourceAsset: ActualAsset.native(),
        sendMax: '15',
        destPublicKey: DESTINATION,
        destAsset: ActualAsset.native(),
        destAmount: '10',
        path: [],
        memo: 'test-memo',
      });

      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);
    });
  });

  // ── getAccountTransactions ─────────────────────────────────────────────

  describe('getAccountTransactions', () => {
    const testPublicKey = Keypair.random().publicKey();

    it('should return transactions with paging_token for cursor', async () => {
      const mockRecords = [
        { paging_token: 'token-1', id: 'tx-1', type: 'payment' },
        { paging_token: 'token-2', id: 'tx-2', type: 'payment' },
      ];

      const mockServer = (service as any).server;
      mockServer.transactions = jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              cursor: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue({ records: mockRecords }),
              }),
            }),
          }),
        }),
      });

      const result = await service.getAccountTransactions(testPublicKey, 'cursor-token', 20);

      expect(result).toEqual({ records: mockRecords });
      expect(mockServer.transactions().forAccount).toHaveBeenCalledWith(testPublicKey);
      expect(mockServer.transactions().forAccount().limit).toHaveBeenCalledWith(20);
      expect(mockServer.transactions().forAccount().limit().order).toHaveBeenCalledWith('desc');
    });

    it('should use default limit of 10', async () => {
      const mockRecords = [];
      const mockServer = (service as any).server;
      mockServer.transactions = jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue({ records: mockRecords }),
            }),
          }),
        }),
      });

      await service.getAccountTransactions(testPublicKey);

      expect(mockServer.transactions().forAccount().limit).toHaveBeenCalledWith(10);
    });

    it('should pass limit to Horizon without capping (capping is done in WalletService)', async () => {
      const mockRecords = [];
      const mockServer = (service as any).server;
      mockServer.transactions = jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue({ records: mockRecords }),
            }),
          }),
        }),
      });

      await service.getAccountTransactions(testPublicKey, undefined, 100);

      expect(mockServer.transactions().forAccount().limit).toHaveBeenCalledWith(100);
    });

    it('should return empty records for 404 (unfunded account)', async () => {
      const mockServer = (service as any).server;
      const error = { response: { status: 404 } };
      mockServer.transactions = jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              call: jest.fn().mockRejectedValue(error),
            }),
          }),
        }),
      });

      const result = await service.getAccountTransactions(testPublicKey);

      expect(result).toEqual({ records: [] });
    });

    it('should propagate non-404 errors', async () => {
      const mockServer = (service as any).server;
      const error = { response: { status: 500 } };
      mockServer.transactions = jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              call: jest.fn().mockRejectedValue(error),
            }),
          }),
        }),
      });

      await expect(service.getAccountTransactions(testPublicKey)).rejects.toEqual(error);
    });

    it('should order transactions in descending order', async () => {
      const mockRecords = [];
      const mockServer = (service as any).server;
      mockServer.transactions = jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue({ records: mockRecords }),
            }),
          }),
        }),
      });

      await service.getAccountTransactions(testPublicKey);

      expect(mockServer.transactions().forAccount().limit().order).toHaveBeenCalledWith('desc');
    });

    it('should not call cursor if cursor is not provided', async () => {
      const mockRecords = [];
      const mockServer = (service as any).server;
      const mockCursor = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: mockRecords }),
      });

      mockServer.transactions = jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              cursor: mockCursor,
              call: jest.fn().mockResolvedValue({ records: mockRecords }),
            }),
          }),
        }),
      });

      await service.getAccountTransactions(testPublicKey);

      expect(mockCursor).not.toHaveBeenCalled();
    });
  });
});
