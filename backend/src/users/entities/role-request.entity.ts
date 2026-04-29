import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';

export type RoleRequestStatus = 'pending' | 'approved' | 'rejected';

@Entity('role_requests')
export class RoleRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'enum', enum: UserRole })
  requestedRole: UserRole;

  @Column({ default: 'pending' })
  status: RoleRequestStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
