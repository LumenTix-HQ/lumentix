import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** A webhook delivery that exhausted all retry attempts. */
@Entity('webhook_dead_letters')
export class WebhookDeadLetter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  eventId: string;

  @Index()
  @Column()
  paymentId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ nullable: true })
  lastStatusCode: number | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column()
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
