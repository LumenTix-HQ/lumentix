import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum DiscountStatus {
  ACTIVE = 'active',
  USED = 'used',
  EXPIRED = 'expired',
}

@Entity('loyalty_discounts')
export class LoyaltyDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  /** Unique discount code, e.g. "LOYALTY-XXXX-XXXX" */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  /** Percentage discount, e.g. 10 = 10% off */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  discountPercent: number;

  /** Points that were spent to generate this discount */
  @Column({ type: 'int' })
  pointsSpent: number;

  @Column({
    type: 'enum',
    enum: DiscountStatus,
    default: DiscountStatus.ACTIVE,
  })
  status: DiscountStatus;

  /** Discount is valid until this date */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Set when the discount is applied to a payment */
  @Column({ nullable: true, type: 'uuid' })
  usedOnEventId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
