import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('email_campaign_analytics')
export class EmailCampaignAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  campaignId: string;

  @Column({ type: 'int', default: 0 })
  totalSent: number;

  @Column({ type: 'int', default: 0 })
  totalDelivered: number;

  @Column({ type: 'int', default: 0 })
  totalOpened: number;

  @Column({ type: 'int', default: 0 })
  totalClicked: number;

  @Column({ type: 'int', default: 0 })
  totalBounced: number;

  @Column({ type: 'int', default: 0 })
  totalUnsubscribed: number;

  @UpdateDateColumn()
  lastUpdatedAt: Date;
}
