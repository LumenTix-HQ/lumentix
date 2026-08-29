import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum GiftStatus {
  /** Wrapped and ready, but not yet released to the recipient. */
  WRAPPED = 'wrapped',
  /** Wrapped with a delivery date in the future. */
  SCHEDULED = 'scheduled',
  /** Released to the recipient; the ticket has moved. */
  DELIVERED = 'delivered',
  /** The recipient has played the reveal. */
  UNWRAPPED = 'unwrapped',
  /** Withdrawn by the sender before delivery. */
  CANCELLED = 'cancelled',
}

export enum GiftWrapStyle {
  CLASSIC = 'classic',
  CONFETTI = 'confetti',
  FIREWORKS = 'fireworks',
  ENVELOPE = 'envelope',
  BIRTHDAY = 'birthday',
}

/**
 * A ticket handed from one user to another with a message and a reveal.
 *
 * Kept separate from `TicketEntity.transferHistory` on purpose: a gift has a
 * lifecycle of its own — it can sit scheduled for weeks, be cancelled before
 * it lands, and be unwrapped long after delivery — none of which fits an
 * append-only transfer log.
 */
@Entity('ticket_gifts')
@Index(['ticketId'])
@Index(['senderId'])
@Index(['recipientId'])
@Index(['status', 'scheduledFor'])
export class TicketGift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  ticketId: string;

  @Column({ type: 'varchar', length: 128 })
  eventId: string;

  @Column({ type: 'varchar', length: 128 })
  senderId: string;

  @Column({ type: 'varchar', length: 128 })
  recipientId: string;

  /** Free-text note from the sender, shown as part of the reveal. */
  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    type: 'enum',
    enum: GiftWrapStyle,
    default: GiftWrapStyle.CLASSIC,
  })
  wrapStyle: GiftWrapStyle;

  @Column({ type: 'enum', enum: GiftStatus, default: GiftStatus.WRAPPED })
  status: GiftStatus;

  /** When the gift should be released. Null means "as soon as it is wrapped". */
  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  unwrappedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
