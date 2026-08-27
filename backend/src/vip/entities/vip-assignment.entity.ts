import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VipTier } from './vip-tier.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';

@Entity('vip_assignments')
export class VipAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tierId: string;

  @ManyToOne(() => VipTier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tierId' })
  tier: VipTier;

  @Column()
  ticketId: string;

  @ManyToOne(() => TicketEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket: TicketEntity;

  @CreateDateColumn()
  assignedAt: Date;
}
