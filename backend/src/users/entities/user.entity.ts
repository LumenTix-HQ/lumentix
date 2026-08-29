import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  email: string;

  @Exclude()
  @Column()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.EVENT_GOER,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ nullable: true, type: 'varchar', unique: true })
  googleId: string | null;

  @Column({ nullable: true, type: 'varchar' })
  stellarPublicKey: string | null;

  /**
   * JSONB map of currency code → balance amount.
   * e.g. { "XLM": 1500.50, "USDC": 250.00 }
   * Populated and updated by the reconciliation job after confirmed payments/refunds.
   */
  @Column({ type: 'jsonb', nullable: true, default: null })
  balances: Record<string, number> | null;

  /**
   * Set by the reconciliation job each time it writes to `balances`.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  balancesUpdatedAt: Date | null;

  @Column({ default: false })
  emailOptOut: boolean;

  @Column({
    type: 'jsonb',
    default: {
      ticketIssued: true,
      paymentFailed: true,
      eventCancelled: true,
      sponsorConfirmed: true,
      eventCompleted: true,
    },
  })
  notificationPreferences: Record<string, boolean>;

  /**
   * User's refund preferences.
   * Default: full refunds preferred, immediate processing, no store credit.
   */
  @Column({
    type: 'jsonb',
    default: {
      preferFullRefund: true,
      preferInstantProcessing: true,
      acceptStoreCredit: false,
      acceptVouchers: true,
      minRefundAmount: null,
    },
    nullable: true,
  })
  refundPreferences: {
    preferFullRefund?: boolean;
    preferInstantProcessing?: boolean;
    acceptStoreCredit?: boolean;
    acceptVouchers?: boolean;
    minRefundAmount?: number | null;
  } | null;

  /**
   * Per-channel, per-category notification opt-in/out.
   * Shape: { push: { <category>: boolean }, email: {...}, sms: {...}, in_app: {...} }
   * A missing category for a channel defaults to enabled.
   */
  @Column({
    type: 'jsonb',
    default: { push: {}, email: {}, sms: {}, in_app: {} },
  })
  channelNotificationPreferences: Record<string, Record<string, boolean>>;

  /**
   * Quiet hours during which non-critical notifications are suppressed.
   * `start`/`end` are "HH:mm" in the given IANA `timezone`; an overnight
   * range (start > end) wraps past midnight.
   */
  @Column({
    type: 'jsonb',
    default: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' },
  })
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true, type: 'varchar' })
  emailVerificationToken: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  emailVerificationTokenExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  deletedAt: Date | null;

  @Column({ nullable: true })
  displayName: string;

  @Column({ nullable: true })
  logoUrl: string;

  /**
   * MFA configuration for organizers and admins.
   * mfaEnabled: Whether MFA is currently active
   * mfaMethod: 'totp' | 'sms' | null (method used for MFA)
   * totpSecret: Base32-encoded TOTP secret (encrypted in DB)
   * phoneNumber: SMS phone number for MFA (encrypted in DB, only populated if SMS is used)
   * backupCodes: Array of backup codes for account recovery
   * mfaVerifiedAt: Timestamp of last MFA verification
   */
  @Column({
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  mfaConfig: {
    enabled?: boolean;
    method?: 'totp' | 'sms' | null;
    totpSecret?: string;
    phoneNumber?: string;
    backupCodes?: string[];
    verifiedAt?: string;
  } | null;

  /**
   * Active MFA sessions with their creation and last verified timestamps
   */
  @Column({
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  mfaSessions: Array<{
    sessionId: string;
    createdAt: string;
    verifiedAt: string;
    method: 'totp' | 'sms';
  }> | null;
}