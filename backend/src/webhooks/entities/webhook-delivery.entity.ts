import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Index(['eventId'])
@Index(['paymentId'])
@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'uuid' })
  paymentId: string;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'int', nullable: true, default: null })
  statusCode: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  responseBody: string | null;

  @Column({ type: 'int', default: 0 })
  attempt: number;

  @CreateDateColumn()
  createdAt: Date;
}
