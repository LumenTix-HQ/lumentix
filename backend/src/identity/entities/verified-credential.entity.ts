import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CredentialProvider } from '../dto/kyc.dto';

@Index(['userId'])
@Index(['userId', 'provider', 'revoked']) // fast lookup for active-credential-per-provider check
@Entity('verified_credentials')
export class VerifiedCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The user this credential belongs to */
  @Column()
  userId: string;

  /**
   * Decentralized Identifier string.
   * Format: did:lumentix:<uuid>  (auto-generated at issuance when not supplied).
   * Can be used by event organizers to verify identity without contacting Lumentix.
   */
  @Column({ type: 'varchar', nullable: true, unique: true })
  did: string | null;

  /** Provider that performed the underlying identity check */
  @Column({ type: 'varchar' })
  provider: CredentialProvider;

  /**
   * Arbitrary JSON metadata supplied at issuance.
   * Stores claims such as name, nationality, verified document type, etc.
   */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  /** Whether this credential has been revoked */
  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  /** Human-readable reason recorded when revoking */
  @Column({ type: 'text', nullable: true })
  revokedReason: string | null;

  /** ISO timestamp at which this credential expires (null = no expiry) */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** UUID of the admin who issued this credential */
  @Column({ type: 'uuid', nullable: true })
  issuedBy: string | null;

  @CreateDateColumn()
  issuedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
