import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  ticketPrice: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column()
  organizerId: string;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.DRAFT,
  })
  status: EventStatus;

  /**
   * Maximum number of attendees (ticket sales cap).
   * NULL means the event has no capacity limit.
   */
  @Column({ type: 'int', nullable: true, default: null })
  maxAttendees: number | null;

  /**
   * Stellar public key of this event's dedicated escrow account.
   * Populated when the event is published.
   */
  @Column({ nullable: true, type: 'varchar' })
  escrowPublicKey: string | null;

  /**
   * AES-256-GCM encrypted escrow secret key.
   * Format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
   * NEVER expose this field in API responses.
   */
  @Column({ nullable: true, type: 'text', select: false })
  escrowSecretEncrypted: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
