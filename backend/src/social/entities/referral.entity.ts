import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReferralStatus {
  PENDING = 'pending',
  CONVERTED = 'converted',
  EXPIRED = 'expired',
}

export enum RewardType {
  LOYALTY_POINTS = 'loyalty_points',
  DISCOUNT_CODE = 'discount_code',
}

@Entity('social_referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  referrerId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  refereeId: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 512 })
  link: string;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ type: 'boolean', default: false })
  rewardIssued: boolean;

  @Column({
    type: 'enum',
    enum: RewardType,
    default: RewardType.LOYALTY_POINTS,
  })
  rewardType: RewardType;

  @Column({ type: 'int', default: 100 })
  rewardValue: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  discountCode: string | null;

  @Column({ type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ type: 'uuid', nullable: true })
  eventId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  convertedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
