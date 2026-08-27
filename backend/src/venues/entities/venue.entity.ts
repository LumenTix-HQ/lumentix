import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VenueStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('venues')
export class Venue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User (organizer) who registered this venue */
  @Index()
  @Column()
  ownerId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 500 })
  address: string;

  @Column({ length: 100, nullable: true })
  city: string | null;

  @Column({ length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  /** Amenities list e.g. ['WiFi', 'Parking', 'AV Equipment'] */
  @Column({ type: 'simple-array', nullable: true })
  amenities: string[] | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number | null;

  @Column({ type: 'enum', enum: VenueStatus, default: VenueStatus.ACTIVE })
  status: VenueStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
