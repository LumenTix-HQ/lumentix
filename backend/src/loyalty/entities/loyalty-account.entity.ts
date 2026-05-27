import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('loyalty_accounts')
export class LoyaltyAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  userId: string;

  /** Current redeemable points balance */
  @Column({ type: 'int', default: 0 })
  pointsBalance: number;

  /** Lifetime points ever earned */
  @Column({ type: 'int', default: 0 })
  totalPointsEarned: number;

  /** Lifetime points ever redeemed */
  @Column({ type: 'int', default: 0 })
  totalPointsRedeemed: number;

  /**
   * Last time points were earned or redeemed.
   * Used to enforce the 12-month inactivity expiry rule.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  lastActivityAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
