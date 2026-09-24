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
@Entity('verified_credentials')
export class VerifiedCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The user this credential belongs to */
  @Column()
  userId: string;

  /** Decentralized Identifier string (optional — may be assigned later) */
  @Column({ type: 'varchar', nullable: true })
  did: string | null;

  @Column({ type: 'varchar' })
  provider: CredentialProvider;

  /** Arbitrary JSON metadata supplied at issuance */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  /** Whether this credential has been revoked */
  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  /** ISO timestamp at which this credential expires (null = no expiry) */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  issuedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
