import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VenueSection } from './venue-section.entity';

export enum SeatStatus {
  AVAILABLE = 'available',
  HELD = 'held',
  BOOKED = 'booked',
}

@Entity('seats')
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sectionId: string;

  @ManyToOne(() => VenueSection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectionId' })
  section: VenueSection;

  @Column()
  seatIdentifier: string;

  @Column()
  row: number;

  @Column()
  number: number;

  @Column({
    type: 'enum',
    enum: SeatStatus,
    default: SeatStatus.AVAILABLE,
  })
  status: SeatStatus;

  @Column({ type: 'varchar', nullable: true })
  heldBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
