import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EmailCampaign } from './email-campaign.entity';

@Entity({ name: 'email_campaign_variants' })
export class EmailCampaignVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  campaignId!: string;

  @ManyToOne(() => EmailCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign!: EmailCampaign;

  @Column({ type: 'varchar', length: 64 })
  label!: string;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'int', default: 0 })
  sentCount!: number;

  @Column({ type: 'int', default: 0 })
  openCount!: number;

  @Column({ type: 'int', default: 0 })
  clickCount!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
