import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('exchange_rates')
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Source currency code — "1 unit of fromCode = rate units of toCode" */
  @Index()
  @Column({ length: 10 })
  fromCode: string;

  @Index()
  @Column({ length: 10 })
  toCode: string;

  @Column({ type: 'decimal', precision: 24, scale: 10 })
  rate: number;

  /** Timestamp when this rate was fetched from the external provider */
  @CreateDateColumn()
  fetchedAt: Date;
}
