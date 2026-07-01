import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SponsorTier } from './sponsor-tier.entity';

export enum ContributionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity('sponsor_contributions')
export class SponsorContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  eventId: string;

  @Index()
  @Column()
  userId: string;

  @Index()
  @Column()
  sponsorId: string;

  @Index()
  @Column()
  tierId: string;

  @ManyToOne(() => SponsorTier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tierId' })
  tier: SponsorTier;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ nullable: true, type: 'varchar' })
  transactionHash: string | null;

  @Column({
    type: 'enum',
    enum: ContributionStatus,
    default: ContributionStatus.PENDING,
  })
  status: ContributionStatus;

  @CreateDateColumn()
  createdAt: Date;
}