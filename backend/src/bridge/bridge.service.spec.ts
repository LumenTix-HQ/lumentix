import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { BridgeService } from './bridge.service';
import {
  BridgeTransfer,
  BridgeTransferStatus,
  SupportedChain,
} from './entities/bridge-transfer.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';

const makeTicket = (over: Partial<TicketEntity> = {}): TicketEntity =>
  ({
    id: 'ticket-001',
    ownerId: 'user-abc',
    status: 'valid',
    assetCode: 'LMTX_EVT_001',
    ...over,
  }) as TicketEntity;

const makePendingTransfer = (over: Partial<BridgeTransfer> = {}): BridgeTransfer =>
  ({
    id: 'xfer-001',
    ticketId: 'ticket-001',
    userId: 'user-abc',
    sourceChain: SupportedChain.STELLAR,
    destinationChain: SupportedChain.ETHEREUM,
    sourceAddress: 'GSTELLARADDRESS',
    destinationAddress: '0xETHADDRESS',
    sourceAssetCode: 'LMTX_EVT_001',
    status: BridgeTransferStatus.PENDING,
    lockTransactionHash: null,
    mintTransactionHash: null,
    auditLog: [],
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as BridgeTransfer;

describe('BridgeService (#1463)', () => {
  let service: BridgeService;

  const mockBridgeRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(async (entity) => ({ ...entity })),
  };

  const mockTicketRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeService,
        {
          provide: getRepositoryToken(BridgeTransfer),
          useValue: mockBridgeRepo,
        },
        {
          provide: getRepositoryToken(TicketEntity),
          useValue: mockTicketRepo,
        },
      ],
    }).compile();

    service = module.get(BridgeService);
  });

  // ── initiate_bridge_transfer ──────────────────────────────────────────────

  describe('initiate_bridge_transfer', () => {
    it('creates a PENDING bridge transfer for a valid ticket', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket());
      mockBridgeRepo.findOne.mockResolvedValue(null);
      mockBridgeRepo.save.mockImplementation(async (e) => ({
        ...e,
        id: 'xfer-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.initiateBridgeTransfer('user-abc', {
        ticketId: 'ticket-001',
        sourceChain: SupportedChain.STELLAR,
        destinationChain: SupportedChain.ETHEREUM,
        sourceAddress: 'GSTELLARADDRESS',
        destinationAddress: '0xETHADDRESS',
      });

      expect(result.status).toBe(BridgeTransferStatus.PENDING);
      expect(result.sourceChain).toBe(SupportedChain.STELLAR);
      expect(result.destinationChain).toBe(SupportedChain.ETHEREUM);
    });

    it('rejects when source and destination chains are identical', async () => {
      await expect(
        service.initiateBridgeTransfer('user-abc', {
          ticketId: 'ticket-001',
          sourceChain: SupportedChain.STELLAR,
          destinationChain: SupportedChain.STELLAR,
          sourceAddress: 'GSTELLARADDRESS',
          destinationAddress: 'GSTELLARADDRESS2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when ticket is not found', async () => {
      mockTicketRepo.findOne.mockResolvedValue(null);
      await expect(
        service.initiateBridgeTransfer('user-abc', {
          ticketId: 'missing-ticket',
          sourceChain: SupportedChain.STELLAR,
          destinationChain: SupportedChain.ETHEREUM,
          sourceAddress: 'GXXX',
          destinationAddress: '0xYYY',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when caller does not own the ticket', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket({ ownerId: 'other-user' }));
      mockBridgeRepo.findOne.mockResolvedValue(null);
      await expect(
        service.initiateBridgeTransfer('user-abc', {
          ticketId: 'ticket-001',
          sourceChain: SupportedChain.STELLAR,
          destinationChain: SupportedChain.ETHEREUM,
          sourceAddress: 'GXXX',
          destinationAddress: '0xYYY',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a duplicate active bridge transfer for the same ticket', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket());
      mockBridgeRepo.findOne.mockResolvedValue(makePendingTransfer());
      await expect(
        service.initiateBridgeTransfer('user-abc', {
          ticketId: 'ticket-001',
          sourceChain: SupportedChain.STELLAR,
          destinationChain: SupportedChain.ETHEREUM,
          sourceAddress: 'GXXX',
          destinationAddress: '0xYYY',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── lock_source_token ─────────────────────────────────────────────────────

  describe('lock_source_token', () => {
    it('transitions a PENDING transfer to SOURCE_LOCKED', async () => {
      const pending = makePendingTransfer();
      mockBridgeRepo.findOne.mockResolvedValue(pending);
      mockBridgeRepo.save.mockImplementation(async (e) => ({
        ...e,
        updatedAt: new Date(),
      }));

      const result = await service.lockSourceToken('xfer-001', 'user-abc');

      expect(result.status).toBe(BridgeTransferStatus.SOURCE_LOCKED);
      expect(result.lockTransactionHash).toBeTruthy();
    });

    it('rejects when transfer is not in PENDING status', async () => {
      mockBridgeRepo.findOne.mockResolvedValue(
        makePendingTransfer({ status: BridgeTransferStatus.SOURCE_LOCKED }),
      );
      await expect(
        service.lockSourceToken('xfer-001', 'user-abc'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when caller does not own the transfer', async () => {
      mockBridgeRepo.findOne.mockResolvedValue(
        makePendingTransfer({ userId: 'other-user' }),
      );
      await expect(
        service.lockSourceToken('xfer-001', 'user-abc'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── mint_bridged_token ────────────────────────────────────────────────────

  describe('mint_bridged_token', () => {
    it('completes a SOURCE_LOCKED transfer and records the mint hash', async () => {
      const locked = makePendingTransfer({
        status: BridgeTransferStatus.SOURCE_LOCKED,
        lockTransactionHash: 'lock-hash-abc',
      });
      mockBridgeRepo.findOne.mockResolvedValue(locked);
      mockBridgeRepo.save.mockImplementation(async (e) => ({
        ...e,
        updatedAt: new Date(),
      }));

      const result = await service.mintBridgedToken('xfer-001', 'user-abc');

      expect(result.status).toBe(BridgeTransferStatus.COMPLETED);
      expect(result.mintTransactionHash).toBeTruthy();
    });

    it('rejects when transfer is not in SOURCE_LOCKED status', async () => {
      mockBridgeRepo.findOne.mockResolvedValue(makePendingTransfer());
      await expect(
        service.mintBridgedToken('xfer-001', 'user-abc'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
