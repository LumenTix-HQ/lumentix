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

@Entity('team_members')
export class TeamMember {
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

  @Column({ default: 'member' })
  role: 'owner' | 'admin' | 'member' | 'viewer';

  @Column({ type: 'jsonb', nullable: true })
  permissions: string[];

  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt: Date;

  @Column({ default: 'pending' })
  status: 'pending' | 'active' | 'removed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
