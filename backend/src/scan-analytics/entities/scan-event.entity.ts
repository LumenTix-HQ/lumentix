import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Index(['eventId', 'gateId', 'scannedAt'])
@Entity({ name: 'scan_events' })
export class ScanEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  eventId!: string;

  @Column({ type: 'varchar', length: 64 })
  gateId!: string;

  @Column({ type: 'varchar', length: 128 })
  ticketId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  scannedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  scannedAt!: Date;
}
