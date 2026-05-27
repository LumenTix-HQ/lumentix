import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { EventAgeRestriction } from '../../events/entities/event.entity';

export { EventAgeRestriction as AgeRestriction };

export enum VerificationMethod {
  MANUAL = 'manual',
  IDENTITY_SERVICE = 'identity_service',
  BLOCKCHAIN = 'blockchain',
  THIRD_PARTY = 'third_party',
}

export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';

@Index(['userId', 'status'])
@Index(['eventId', 'userId'])
@Entity('age_verifications')
export class AgeVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  eventId: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({
    type: 'enum',
    enum: EventAgeRestriction,
    default: EventAgeRestriction.NONE,
  })
  ageRestriction: EventAgeRestriction;

  @Column({
    type: 'enum',
    enum: VerificationMethod,
    default: VerificationMethod.MANUAL,
  })
  verificationMethod: VerificationMethod;

  @Column({ default: 'pending' })
  status: VerificationStatus;

  @Column({ type: 'varchar', nullable: true })
  identityVerificationId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  verificationMetadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
