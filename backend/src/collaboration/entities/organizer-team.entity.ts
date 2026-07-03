import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TeamTask } from './team-task.entity';
import { TeamMessage } from './team-message.entity';
import { TeamResource } from './team-resource.entity';

@Entity('organizer_teams')
export class OrganizerTeam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id' })
  eventId: string;

  @Column({ name: 'team_name' })
  teamName: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    allowGuestAccess: boolean;
    requireApproval: boolean;
    maxMembers: number;
  };

  @Column({ default: 'active' })
  status: 'active' | 'archived' | 'deleted';

  @OneToMany(() => TeamTask, (task) => task.team)
  tasks: TeamTask[];

  @OneToMany(() => TeamMessage, (message) => message.team)
  messages: TeamMessage[];

  @OneToMany(() => TeamResource, (resource) => resource.team)
  resources: TeamResource[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
