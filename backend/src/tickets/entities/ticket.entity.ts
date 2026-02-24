import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type TicketStatus = 'valid' | 'used' | 'refunded';

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

  @CreateDateColumn()
  createdAt!: Date;
}
