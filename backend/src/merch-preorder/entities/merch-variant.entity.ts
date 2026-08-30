import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'merch_variants' })
export class MerchVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  merchItemId!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  size!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  color!: string | null;

  @Column({ type: 'int' })
  stockTotal!: number;

  @Column({ type: 'int', default: 0 })
  stockReserved!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
