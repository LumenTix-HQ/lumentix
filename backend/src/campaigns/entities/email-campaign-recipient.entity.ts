import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EmailCampaignVariant } from './email-campaign-variant.entity';

@Entity({ name: 'email_campaign_recipients' })
export class EmailCampaignRecipient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  campaignId!: string;

  @Column()
  variantId!: string;

  @ManyToOne(() => EmailCampaignVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant!: EmailCampaignVariant;

  @Column()
  userId!: string;

  @CreateDateColumn()
  sentAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  openedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  clickedAt!: Date | null;
}
