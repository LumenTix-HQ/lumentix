import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_wallets')
export class UserWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ unique: true })
  publicKey: string;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ nullable: true, type: 'varchar' })
  label: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
