import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'boolean', default: false })
  flagged: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
