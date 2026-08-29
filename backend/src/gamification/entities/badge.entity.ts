import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('gamification_badges')
export class Badge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  key: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** URL or icon identifier for the badge artwork */
  @Column({ nullable: true })
  iconUrl: string | null;

  /** XP reward granted when this badge is first earned */
  @Column({ type: 'int', default: 0 })
  xpReward: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
