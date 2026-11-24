import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum FraudRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum FraudReason {
  WASH_TRADING = 'wash_trading',
  BOT_ACTIVITY = 'bot_activity',
  PRICE_ANOMALY = 'price_anomaly',
}

@Entity('fraud_flags')
@Index(['ticketId'])
@Index(['buyerId'])
@Index(['sellerId'])
export class FraudFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ticketId: string;

  @Column()
  eventId: string;

  @Column()
  buyerId: string;

  @Column()
  sellerId: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  price: number;

  @Column({ type: 'int' })
  riskScore: number;

  @Column({ type: 'varchar' })
  riskLevel: FraudRiskLevel;

  @Column({ type: 'simple-array' })
  reasons: FraudReason[];

  @Column({ type: 'boolean', default: false })
  onHold: boolean;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
