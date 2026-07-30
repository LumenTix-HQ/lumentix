import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { InsuranceProduct } from './insurance-product.entity';

export enum InsurerStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

/**
 * Represents a third-party insurer registered on the marketplace.
 * Each insurer is backed by a platform User account (userId = User.id).
 */
@Entity('insurers')
export class Insurer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The platform user account that owns this insurer profile. */
  @Index({ unique: true })
  @Column()
  userId: string;

  @Column()
  companyName: string;

  @Column({ unique: true })
  licenseNumber: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  websiteUrl: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  logoUrl: string | null;

  /** Country of incorporation (ISO 3166-1 alpha-2, e.g. "NG", "US"). */
  @Column({ length: 2, nullable: true, default: null })
  countryCode: string | null;

  @Column({
    type: 'enum',
    enum: InsurerStatus,
    default: InsurerStatus.PENDING_APPROVAL,
  })
  status: InsurerStatus;

  /** Average rating out of 5, computed from PolicyReview records. */
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  totalPoliciesSold: number;

  @Column({ type: 'int', default: 0 })
  totalClaimsPaid: number;

  @OneToMany(() => InsuranceProduct, (product) => product.insurer, {
    cascade: false,
  })
  products: InsuranceProduct[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  deletedAt: Date | null;
}
