import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum MeetupGroupStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

@Index(['eventId', 'status'])
@Entity('meetup_groups')
export class MeetupGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Event this meetup group is associated with */
  @Index()
  @Column()
  eventId: string;

  /** User who created the group */
  @Index()
  @Column()
  creatorId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Where the group plans to meet (e.g. "Main lobby", "Coffee stand B") */
  @Column({ type: 'varchar', length: 200, nullable: true })
  meetingPoint: string | null;

  /** Planned meetup time (must be during or around the event) */
  @Column({ type: 'timestamptz', nullable: true })
  meetingTime: Date | null;

  /** Maximum number of members (null = unlimited) */
  @Column({ type: 'int', nullable: true, default: null })
  maxMembers: number | null;

  @Column({
    type: 'enum',
    enum: MeetupGroupStatus,
    default: MeetupGroupStatus.OPEN,
  })
  status: MeetupGroupStatus;

  /** Topics / interests this group focuses on */
  @Column({ type: 'simple-array', nullable: true })
  topics: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
