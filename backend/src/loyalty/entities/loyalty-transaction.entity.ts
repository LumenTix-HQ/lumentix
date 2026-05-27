import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum LoyaltyTransactionType {
  EARN = 'earn',
  REDEEM = 'redeem',
  EXPIRE = 'expire',
}

@Index(['userId', 'createdAt'])
@Entity('loyalty_transactions')
export class LoyaltyTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: LoyaltyTransactionType,
  })
  type: LoyaltyTransactionType;

  /** Positive for earn, negative for redeem/expire */
  @Column({ type: 'int' })
  points: number;

  /** Running balance after this transaction */
  @Column({ type: 'int' })
  balanceAfter: number;

  /** Human-readable reason, e.g. "Attended event: Summer Fest 2025" */
  @Column({ type: 'varchar', length: 255 })
  description: string;

  /** Optional reference to the event that triggered this transaction */
  @Column({ nullable: true, type: 'uuid' })
  eventId: string | null;

  /** Optional reference to the discount code generated on redemption */
  @Column({ nullable: true, type: 'uuid' })
  discountId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
