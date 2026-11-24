import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One per (user, category) bucket. `weight` and `attendanceCount` are the raw
 * inputs used to build the user's implicit profile vector (#1243).
 *
 * Maps to the `user_preferences` table created by the
 * AddRecommendations migration.
 */
@Entity({ name: 'user_preferences' })
@Index(['userId', 'category'])
export class UserPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
  })
  userId: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  category: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  location: string | null;

  @Column({
    type: 'int',
    default: 0,
  })
  weight: number;

  @Column({
    type: 'int',
    default: 0,
  })
  attendanceCount: number;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
