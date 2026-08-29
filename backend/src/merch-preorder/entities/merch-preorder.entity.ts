import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MerchVariant } from './merch-variant.entity';

export type MerchPreorderStatus = 'reserved' | 'picked_up' | 'cancelled';

@Entity({ name: 'merch_preorders' })
export class MerchPreorder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  variantId!: string;

  @ManyToOne(() => MerchVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant!: MerchVariant;

  @Column()
  ticketId!: string;

  @Column()
  buyerId!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'varchar', length: 16, default: 'reserved' })
  status!: MerchPreorderStatus;

  @CreateDateColumn()
  reservedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  pickedUpAt!: Date | null;
}
