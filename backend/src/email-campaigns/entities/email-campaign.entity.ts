import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  CANCELLED = 'cancelled',
}

@Index(['organizerId', 'status'])
@Entity('email_campaigns')
export class EmailCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The organizer who owns this campaign */
  @Index()
  @Column()
  organizerId: string;

  /**
   * Optional event filter.
   * NULL → all past attendees across all organizer events.
   * Set → attendees of that specific event only.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true, default: null })
  eventId: string | null;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  bodyHtml: string;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  status: CampaignStatus;

  @Column({ type: 'int', default: 0 })
  recipientCount: number;

  @Column({ type: 'timestamp', nullable: true, default: null })
  scheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
