import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Append-only log of edits/tasks/comments applied to a workspace. Used both
 * as the sync history and as the record of which changes went through
 * conflict resolution (`conflict = true`).
 */
@Entity('workspace_changes')
export class WorkspaceChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Which part of the workspace this change targets, e.g. "title", "task", "comment". */
  @Column()
  field: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  /** Workspace version the client had loaded when it made this edit. */
  @Column({ type: 'int' })
  baseVersion: number;

  /** Workspace version after this change was applied. */
  @Column({ type: 'int' })
  resultVersion: number;

  /** True when baseVersion was stale and last-write-wins conflict resolution ran. */
  @Column({ default: false })
  conflict: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
