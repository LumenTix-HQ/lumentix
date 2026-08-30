import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Badge } from './badge.entity';

@Entity('gamification_user_badges')
@Index(['userId', 'badgeId'], { unique: true })
export class UserBadge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column()
  badgeId: string;

  @ManyToOne(() => Badge, { eager: true, onDelete: 'CASCADE' })
  badge: Badge;

  @CreateDateColumn()
  earnedAt: Date;
}
