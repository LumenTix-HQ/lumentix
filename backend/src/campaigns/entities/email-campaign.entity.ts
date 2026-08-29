import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type EmailCampaignStatus = 'draft' | 'testing' | 'completed';

@Entity({ name: 'email_campaigns' })
export class EmailCampaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  organizerId!: string;

  @Column({ type: 'varchar', nullable: true })
  eventId!: string | null;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: EmailCampaignStatus;

  @Column({ type: 'varchar', nullable: true })
  winningVariantId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
