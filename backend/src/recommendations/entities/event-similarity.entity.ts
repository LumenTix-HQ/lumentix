import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('event_similarities')
@Index(['eventId', 'similarEventId'])
@Index(['similarityScore'])
export class EventSimilarity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventId: string;

  @Column()
  similarEventId: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  similarityScore: number;

  @Column({ type: 'jsonb', nullable: true })
  sharedAttributes: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
