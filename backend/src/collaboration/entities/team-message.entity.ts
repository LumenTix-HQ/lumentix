import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizerTeam } from './organizer-team.entity';
import { User } from '../../users/entities/user.entity';

@Entity('team_messages')
export class TeamMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'team_id' })
  teamId: string;

  @ManyToOne(() => OrganizerTeam)
  @JoinColumn({ name: 'team_id' })
  team: OrganizerTeam;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: 'text' })
  messageType: 'text' | 'image' | 'file' | 'system';

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ name: 'reply_to', nullable: true })
  replyTo: string;

  @Column({ type: 'jsonb', nullable: true })
  mentions: string[];

  @Column({ default: false })
  isPinned: boolean;

  @Column({ type: 'timestamp', nullable: true })
  editedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  reactions: Array<{ emoji: string; userIds: string[] }>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
