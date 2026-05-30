import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type TicketStatus = 'valid' | 'used' | 'refunded' | 'expired';

@Index(['eventId', 'status'])
@Entity({ name: 'tickets' })
export class TicketEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  eventId!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  ownerId!: string;

  @Column({ type: 'varchar', length: 32 })
  assetCode!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  transactionHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'valid' })
  status!: TicketStatus;

  /**
   * Hex-encoded SHA256withRSA/Ed25519 signature over this ticket's UUID.
   * Generated at issuance using TICKET_SIGNING_PRIVATE_KEY.
   * Verified at scan time using TICKET_SIGNING_PUBLIC_KEY.
   */
  @Column({ type: 'text', nullable: true })
  signature!: string | null;

  @Column({ type: 'varchar', nullable: true })
  pdfUrl!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 7, nullable: true })
  listingPrice!: number | null;

  @Column({ default: false })
  isListed!: boolean;

  @Column({ type: 'varchar', nullable: true })
  listingCurrency!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  listedAt!: Date | null;

  /**
   * Stellar public key of the current ticket owner.
   * Updated on transfer to enable on-chain asset transfer.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ownerPublicKey!: string | null;

  /**
   * Persistent audit log of all ownership transfers for this ticket.
   * Each entry: { from: string; to: string; timestamp: string }
   */
  @Column({ type: 'jsonb', default: [] })
  transferHistory!: Array<{ from: string; to: string; timestamp: string }>;

  @CreateDateColumn()
  createdAt!: Date;
}
