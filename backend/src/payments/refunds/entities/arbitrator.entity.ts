import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A registered arbitrator who can resolve dispute claims
 */
@Entity('arbitrators')
@Index(['userId'], { unique: true })
export class Arbitrator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The user who is registered as an arbitrator */
  @Column({ type: 'uuid' })
  userId: string;

  /** Areas of expertise (e.g., "event_ticketing", "refunds", "fraud") */
  @Column({ type: 'jsonb', default: [] })
  expertise: string[];

  /** Reputation score 0–1000 assigned by the platform based on past resolutions */
  @Column({ type: 'int', default: 0 })
  reputationScore: number;

  /** Total number of disputes this arbitrator has resolved */
  @Column({ type: 'int', default: 0 })
  totalResolved: number;

  /** Whether the arbitrator is currently active and accepting assignments */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

