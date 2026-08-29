import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type DataDeletionRequestStatus = 'pending' | 'completed';

@Entity({ name: 'data_deletion_requests' })
export class DataDeletionRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: DataDeletionRequestStatus;

  @CreateDateColumn()
  requestedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
