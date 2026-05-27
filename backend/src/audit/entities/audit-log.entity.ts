import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AuditAction {
  // Payments
  PAYMENT_INTENT_CREATED = 'PAYMENT_INTENT_CREATED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',

  // Refunds
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  REFUND_APPROVED = 'REFUND_APPROVED',
  REFUND_REJECTED = 'REFUND_REJECTED',

  // Escrow
  ESCROW_CREATED = 'ESCROW_CREATED',
  ESCROW_RELEASED = 'ESCROW_RELEASED',

  // Events
  EVENT_PUBLISHED = 'EVENT_PUBLISHED',
  EVENT_CANCELLED = 'EVENT_CANCELLED',
  EVENT_COMPLETED = 'EVENT_COMPLETED',

  // Age Verification
  AGE_VERIFIED = 'AGE_VERIFIED',
  AGE_RESTRICTION_SET = 'AGE_RESTRICTION_SET',

  // Resale Marketplace
  RESALE_LISTED = 'RESALE_LISTED',
  RESALE_BOUGHT = 'RESALE_BOUGHT',
  RESALE_CANCELLED = 'RESALE_CANCELLED',

  // Recommendations
  PREFERENCES_UPDATED = 'PREFERENCES_UPDATED',
  RECOMMENDATIONS_GENERATED = 'RECOMMENDATIONS_GENERATED',

  // Mobile Wallet
  MOBILE_PAYMENT_PROCESSED = 'MOBILE_PAYMENT_PROCESSED',
  MOBILE_PAYMENT_FAILED = 'MOBILE_PAYMENT_FAILED',
}

@Index(['userId', 'action'])
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  action: string;

  @Index()
  @Column()
  userId: string;

  @Column({ nullable: true, type: 'varchar' })
  resourceId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
