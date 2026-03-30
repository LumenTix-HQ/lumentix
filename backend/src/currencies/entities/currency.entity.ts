import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('currencies')
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ISO 4217 code, e.g. "NGN", "USD", "XLM" */
  @Index({ unique: true })
  @Column({ length: 10 })
  code: string;

  /** Full human-readable name, e.g. "Nigerian Naira" */
  @Column({ length: 100 })
  displayName: string;

  /** Symbol shown in the UI, e.g. "₦", "$", "₳" */
  @Column({ length: 10 })
  symbol: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
