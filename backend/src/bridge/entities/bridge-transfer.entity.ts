import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BridgeTransferStatus {
  PENDING = 'pending',
  SOURCE_LOCKED = 'source_locked',
  MINTING = 'minting',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum SupportedChain {
  STELLAR = 'stellar',
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  BASE = 'base',
}

/**
 * Persists the lifecycle of a cross-chain bridge transfer for a ticket NFT
 * (#1463). Each row tracks the full journey from source-chain lock through
 * destination-chain mint.
 *
 * Table: bridge_transfers
 */
@Entity({ name: 'bridge_transfers' })
@Index(['userId', 'status'])
@Index(['ticketId', 'status'])
export class BridgeTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The internal ticket UUID being bridged. */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  ticketId: string;

  /** The user initiating the bridge operation. */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId: string;

  @Column({ type: 'varchar', length: 64, enum: SupportedChain })
  sourceChain: SupportedChain;

  @Column({ type: 'varchar', length: 64, enum: SupportedChain })
  destinationChain: SupportedChain;

  /** Address / public key on the source chain that holds the asset. */
  @Column({ type: 'varchar', length: 128 })
  sourceAddress: string;

  /** Address on the destination chain that should receive the minted token. */
  @Column({ type: 'varchar', length: 128 })
  destinationAddress: string;

  /**
   * The Stellar asset code (or ERC-721 contract address, etc.) on the
   * source chain.
   */
  @Column({ type: 'varchar', length: 128 })
  sourceAssetCode: string;

  /**
   * Transaction hash / ledger reference that proves the source token was
   * locked. Set after `lock_source_token` completes.
   */
  @Column({ type: 'varchar', length: 256, nullable: true })
  lockTransactionHash: string | null;

  /**
   * Transaction hash on the destination chain where the bridged token was
   * minted. Set after `mint_bridged_token` completes.
   */
  @Column({ type: 'varchar', length: 256, nullable: true })
  mintTransactionHash: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: BridgeTransferStatus,
    default: BridgeTransferStatus.PENDING,
  })
  status: BridgeTransferStatus;

  /** Unstructured audit trail appended by each stage of the pipeline. */
  @Column({ type: 'jsonb', default: [] })
  auditLog: Array<{
    stage: string;
    message: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }>;

  /** ISO-8601 deadline; transfer auto-refunds if not completed by this time. */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
