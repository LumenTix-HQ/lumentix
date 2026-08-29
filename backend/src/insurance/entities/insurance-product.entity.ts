import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Insurer } from './insurer.entity';
import { CoverageType } from '../enums/coverage-type.enum';
import { InsuranceProductStatus } from '../enums/insurance-product-status.enum';

/**
 * A single insurance product offered by an Insurer on the marketplace.
 * Products define coverage terms; Policies are the per-purchase instances.
 */
@Index(['insurerId', 'status'])
@Entity('insurance_products')
export class InsuranceProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  insurerId: string;

  @ManyToOne(() => Insurer, (insurer) => insurer.products, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'insurerId' })
  insurer: Insurer;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({
    type: 'enum',
    enum: CoverageType,
  })
  coverageType: CoverageType;

  /** Premium amount in the platform's base currency (USD). */
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  premiumAmount: number;

  /** Maximum payout this product will cover per policy. */
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  maxCoverageAmount: number;

  /** Currency code of premiumAmount and maxCoverageAmount (default: USD). */
  @Column({ default: 'USD' })
  currency: string;

  /**
   * Flexible JSON structure holding coverage terms:
   * - deductible, exclusions, waiting period, covered perils, etc.
   */
  @Column({ type: 'jsonb', default: {} })
  coverageTerms: Record<string, unknown>;

  /** Minimum days before the event that a policy must be purchased. */
  @Column({ type: 'int', default: 0 })
  minDaysBeforeEvent: number;

  /** Maximum attendee count the product supports (null = unlimited). */
  @Column({ type: 'int', nullable: true, default: null })
  maxAttendeesSupported: number | null;

  @Column({
    type: 'enum',
    enum: InsuranceProductStatus,
    default: InsuranceProductStatus.DRAFT,
  })
  status: InsuranceProductStatus;

  @Column({ type: 'int', default: 0 })
  totalPoliciesSold: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
