import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BridgeTransfer,
  BridgeTransferStatus,
  SupportedChain,
} from './entities/bridge-transfer.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { InitiateBridgeTransferDto } from './dto/initiate-bridge-transfer.dto';
import { BridgeTransferResponseDto } from './dto/bridge-transfer-response.dto';

/** TTL for a pending bridge transfer before it is auto-expired. */
const BRIDGE_TTL_HOURS = 24;

/**
 * Implements the three-step cross-chain bridging pipeline for ticket NFTs
 * (#1463):
 *
 *   1. initiate_bridge_transfer  — validate, create the transfer record,
 *      return its pending state.
 *   2. lock_source_token         — mark the source-chain token as locked
 *      and record the lock transaction hash.
 *   3. mint_bridged_token        — record the destination-chain mint hash
 *      and mark the transfer completed.
 *
 * Actual on-chain calls are stubbed with logged placeholders so the module
 * can be wired end-to-end without a live RPC connection; replace the
 * `_submitLockToChain` and `_submitMintToChain` private helpers to connect a
 * real blockchain SDK.
 */
@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  constructor(
    @InjectRepository(BridgeTransfer)
    private readonly bridgeRepo: Repository<BridgeTransfer>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Step 1 — Validate the request, create a PENDING bridge transfer record,
   * and return the transfer envelope the caller can poll.
   */
  async initiateBridgeTransfer(
    userId: string,
    dto: InitiateBridgeTransferDto,
  ): Promise<BridgeTransferResponseDto> {
    if (dto.sourceChain === dto.destinationChain) {
      throw new BadRequestException(
        'Source and destination chains must differ.',
      );
    }

    const ticket = await this.ticketRepo.findOne({
      where: { id: dto.ticketId },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket "${dto.ticketId}" not found.`);
    }
    if (ticket.ownerId !== userId) {
      throw new ForbiddenException('You do not own this ticket.');
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException(
        `Ticket is in status "${ticket.status}" and cannot be bridged.`,
      );
    }

    // Prevent concurrent bridge operations on the same ticket.
    const activeBridge = await this.bridgeRepo.findOne({
      where: [
        { ticketId: dto.ticketId, status: BridgeTransferStatus.PENDING },
        { ticketId: dto.ticketId, status: BridgeTransferStatus.SOURCE_LOCKED },
        { ticketId: dto.ticketId, status: BridgeTransferStatus.MINTING },
      ],
    });
    if (activeBridge) {
      throw new BadRequestException(
        `An active bridge transfer already exists for this ticket (id: ${activeBridge.id}).`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + BRIDGE_TTL_HOURS);

    const transfer = this.bridgeRepo.create({
      ticketId: dto.ticketId,
      userId,
      sourceChain: dto.sourceChain,
      destinationChain: dto.destinationChain,
      sourceAddress: dto.sourceAddress,
      destinationAddress: dto.destinationAddress,
      sourceAssetCode: ticket.assetCode,
      status: BridgeTransferStatus.PENDING,
      expiresAt,
      auditLog: [
        {
          stage: 'initiate',
          message: 'Bridge transfer initiated.',
          timestamp: new Date().toISOString(),
          metadata: {
            sourceChain: dto.sourceChain,
            destinationChain: dto.destinationChain,
          },
        },
      ],
    });

    const saved = await this.bridgeRepo.save(transfer);
    this.logger.log(
      `Bridge transfer ${saved.id} initiated for ticket ${dto.ticketId} ` +
        `${dto.sourceChain} → ${dto.destinationChain}`,
    );
    return this.toDto(saved);
  }

  /**
   * Step 2 — Lock the source-chain token.
   *
   * Transitions the transfer from PENDING → SOURCE_LOCKED and records the
   * `lockTransactionHash` returned by the chain adapter. In a real deployment
   * the caller supplies the signed lock transaction XDR / hash; here we
   * simulate the submission and return a deterministic fake hash.
   */
  async lockSourceToken(
    transferId: string,
    userId: string,
    signedLockTxXdr?: string,
  ): Promise<BridgeTransferResponseDto> {
    const transfer = await this.assertOwned(transferId, userId);

    if (transfer.status !== BridgeTransferStatus.PENDING) {
      throw new BadRequestException(
        `Expected status PENDING, got "${transfer.status}".`,
      );
    }
    if (transfer.expiresAt && transfer.expiresAt < new Date()) {
      await this.expireTransfer(transfer);
      throw new BadRequestException('Bridge transfer has expired.');
    }

    // Submit to the source chain (stubbed).
    const lockHash = await this._submitLockToChain(
      transfer.sourceChain,
      transfer.sourceAssetCode,
      transfer.sourceAddress,
      signedLockTxXdr,
    );

    transfer.lockTransactionHash = lockHash;
    transfer.status = BridgeTransferStatus.SOURCE_LOCKED;
    transfer.auditLog = [
      ...transfer.auditLog,
      {
        stage: 'lock_source_token',
        message: 'Source token locked on-chain.',
        timestamp: new Date().toISOString(),
        metadata: { lockHash },
      },
    ];

    const saved = await this.bridgeRepo.save(transfer);
    this.logger.log(
      `Bridge transfer ${transferId}: source locked, hash=${lockHash}`,
    );
    return this.toDto(saved);
  }

  /**
   * Step 3 — Mint the bridged token on the destination chain.
   *
   * Transitions the transfer from SOURCE_LOCKED → COMPLETED and records the
   * `mintTransactionHash`. In production this is an oracle/relayer call;
   * here it returns a deterministic fake hash.
   */
  async mintBridgedToken(
    transferId: string,
    userId: string,
  ): Promise<BridgeTransferResponseDto> {
    const transfer = await this.assertOwned(transferId, userId);

    if (transfer.status !== BridgeTransferStatus.SOURCE_LOCKED) {
      throw new BadRequestException(
        `Expected status SOURCE_LOCKED, got "${transfer.status}". ` +
          'Call lock_source_token first.',
      );
    }
    if (transfer.expiresAt && transfer.expiresAt < new Date()) {
      await this.expireTransfer(transfer);
      throw new BadRequestException('Bridge transfer has expired.');
    }

    transfer.status = BridgeTransferStatus.MINTING;
    await this.bridgeRepo.save(transfer);

    // Submit mint to the destination chain (stubbed).
    const mintHash = await this._submitMintToChain(
      transfer.destinationChain,
      transfer.sourceAssetCode,
      transfer.destinationAddress,
    );

    transfer.mintTransactionHash = mintHash;
    transfer.status = BridgeTransferStatus.COMPLETED;
    transfer.auditLog = [
      ...transfer.auditLog,
      {
        stage: 'mint_bridged_token',
        message: 'Bridged token minted on destination chain.',
        timestamp: new Date().toISOString(),
        metadata: {
          destinationChain: transfer.destinationChain,
          mintHash,
        },
      },
    ];

    const saved = await this.bridgeRepo.save(transfer);
    this.logger.log(
      `Bridge transfer ${transferId}: mint complete, hash=${mintHash}`,
    );
    return this.toDto(saved);
  }

  /** Retrieve all bridge transfers for the authenticated user. */
  async getTransfersForUser(
    userId: string,
  ): Promise<BridgeTransferResponseDto[]> {
    const transfers = await this.bridgeRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return transfers.map((t) => this.toDto(t));
  }

  /** Retrieve a single bridge transfer by id (admin only). */
  async getTransferById(id: string): Promise<BridgeTransferResponseDto> {
    const transfer = await this.bridgeRepo.findOne({ where: { id } });
    if (!transfer) {
      throw new NotFoundException(`Bridge transfer "${id}" not found.`);
    }
    return this.toDto(transfer);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async assertOwned(
    transferId: string,
    userId: string,
  ): Promise<BridgeTransfer> {
    const transfer = await this.bridgeRepo.findOne({
      where: { id: transferId },
    });
    if (!transfer) {
      throw new NotFoundException(
        `Bridge transfer "${transferId}" not found.`,
      );
    }
    if (transfer.userId !== userId) {
      throw new ForbiddenException(
        'You do not own this bridge transfer.',
      );
    }
    return transfer;
  }

  private async expireTransfer(transfer: BridgeTransfer): Promise<void> {
    transfer.status = BridgeTransferStatus.FAILED;
    transfer.auditLog = [
      ...transfer.auditLog,
      {
        stage: 'expire',
        message: 'Transfer expired without completion.',
        timestamp: new Date().toISOString(),
      },
    ];
    await this.bridgeRepo.save(transfer);
  }

  /**
   * Stub: submits a lock instruction to the source chain.
   * Replace this with a real Stellar / EVM SDK call in production.
   *
   * @param chain       Source chain identifier.
   * @param assetCode   Asset to lock.
   * @param fromAddress Sender address on the source chain.
   * @param signedXdr   Optionally pre-signed transaction XDR (Stellar path).
   * @returns           Transaction hash / ledger sequence proving the lock.
   */
  private async _submitLockToChain(
    chain: SupportedChain,
    assetCode: string,
    fromAddress: string,
    signedXdr?: string,
  ): Promise<string> {
    this.logger.debug(
      `[stub] lock on ${chain}: asset=${assetCode} from=${fromAddress} ` +
        `signedXdr=${signedXdr ? 'provided' : 'none'}`,
    );
    // Deterministic fake hash for testing.
    return `lock-${chain}-${assetCode}-${Date.now()}`;
  }

  /**
   * Stub: submits a mint instruction to the destination chain.
   * Replace this with a real oracle / relayer call in production.
   *
   * @param chain      Destination chain identifier.
   * @param assetCode  Asset to mint (mapped from source asset code).
   * @param toAddress  Recipient address on the destination chain.
   * @returns          Destination-chain transaction hash.
   */
  private async _submitMintToChain(
    chain: SupportedChain,
    assetCode: string,
    toAddress: string,
  ): Promise<string> {
    this.logger.debug(
      `[stub] mint on ${chain}: asset=${assetCode} to=${toAddress}`,
    );
    return `mint-${chain}-${assetCode}-${Date.now()}`;
  }

  private toDto(transfer: BridgeTransfer): BridgeTransferResponseDto {
    return {
      id: transfer.id,
      ticketId: transfer.ticketId,
      userId: transfer.userId,
      sourceChain: transfer.sourceChain,
      destinationChain: transfer.destinationChain,
      sourceAddress: transfer.sourceAddress,
      destinationAddress: transfer.destinationAddress,
      sourceAssetCode: transfer.sourceAssetCode,
      status: transfer.status,
      lockTransactionHash: transfer.lockTransactionHash,
      mintTransactionHash: transfer.mintTransactionHash,
      expiresAt: transfer.expiresAt?.toISOString() ?? null,
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
    };
  }
}
