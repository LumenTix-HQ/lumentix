import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Pre-computed similarity edge between two events. `similarityScore` is a
 * decimal in [0, 1] surfaced to the ranking stage of the recommendation
 * engine so it can promote events that behave like ones the user already
 * attended (#1243).
 *
 * Maps to the `event_similarities` table created by the AddRecommendations
 * migration.
 */
@Entity({ name: 'event_similarities' })
@Index(['eventId', 'similarEventId'])
@Index(['similarityScore'])
export class EventSimilarity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  eventId: string;

  @Column({ type: 'varchar' })
  similarEventId: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    default: 0,
  })
  similarityScore: number;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  sharedAttributes: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
