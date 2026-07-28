import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AccessibilityInventory, AccessibilityType } from './accessibility-inventory.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';

@Entity('accessibility_bookings')
export class AccessibilityBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  inventoryId: string;

  @ManyToOne(() => AccessibilityInventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventoryId' })
  inventory: AccessibilityInventory;

  @Column()
  ticketId: string;

  @ManyToOne(() => TicketEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket: TicketEntity;

  @Column({ type: 'enum', enum: AccessibilityType })
  type: AccessibilityType;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  bookedAt: Date;
}
