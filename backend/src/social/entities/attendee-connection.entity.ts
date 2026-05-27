import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ConnectionStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  BLOCKED = 'blocked',
}

@Index(['requesterId', 'recipientId'], { unique: true })
@Index(['recipientId', 'status'])
@Entity('attendee_connections')
export class AttendeeConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User who sent the connection request */
  @Index()
  @Column()
  requesterId: string;

  /** User who received the connection request */
  @Index()
  @Column()
  recipientId: string;

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.PENDING,
  })
  status: ConnectionStatus;

  /** Optional message sent with the connection request */
  @Column({ type: 'text', nullable: true })
  message: string | null;

  /** Event context where the connection was initiated */
  @Column({ nullable: true, type: 'uuid' })
  eventId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
