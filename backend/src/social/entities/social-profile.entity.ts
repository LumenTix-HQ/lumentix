import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ProfileVisibility {
  /** Visible to all attendees of shared events */
  PUBLIC = 'public',
  /** Visible only to accepted connections */
  CONNECTIONS_ONLY = 'connections_only',
  /** Hidden from all attendee lists */
  PRIVATE = 'private',
}

/**
 * Opt-in social profile for an attendee.
 * Created only when the user explicitly enables social features.
 */
@Entity('social_profiles')
export class SocialProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  userId: string;

  /** Display name shown to other attendees */
  @Column({ type: 'varchar', length: 100, nullable: true })
  displayName: string | null;

  /** Short bio visible on the attendee list */
  @Column({ type: 'text', nullable: true })
  bio: string | null;

  /** Professional title or role */
  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string | null;

  /** Optional LinkedIn / Twitter / personal site */
  @Column({ type: 'jsonb', default: {} })
  socialLinks: Record<string, string>;

  /** Interests / topics the attendee wants to discuss */
  @Column({ type: 'simple-array', nullable: true })
  interests: string[] | null;

  @Column({
    type: 'enum',
    enum: ProfileVisibility,
    default: ProfileVisibility.PUBLIC,
  })
  visibility: ProfileVisibility;

  /** Whether the user appears in event attendee lists */
  @Column({ default: true })
  showInAttendeeList: boolean;

  /** Whether the user accepts direct connection requests */
  @Column({ default: true })
  acceptConnectionRequests: boolean;

  /** Whether the user can receive direct messages */
  @Column({ default: true })
  allowDirectMessages: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
