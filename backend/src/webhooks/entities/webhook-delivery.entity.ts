import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  eventId: string;

  @Index()
  @Column()
  paymentId: string;

  @Column()
  attempt: number;

  @Column({ nullable: true })
  statusCode: number | null;

  @Column({ type: 'text', nullable: true })
  responseBody: string | null;

  @CreateDateColumn()
  sentAt: Date;
}