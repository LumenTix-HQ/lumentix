/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
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
});
