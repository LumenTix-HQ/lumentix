import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Event } from '../../events/entities/event.entity';

@Entity('pass_packages')
export class PassPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ default: 'USD' })
  currency: string;

  /**
   * Number of events allowed in this package
   * e.g., 3 = any 3 out of totalEvents
   */
  @Column()
  eventsAllowed: number;

  /**
   * Total number of events available in this package
   */
  @Column()
  totalEvents: number;

  /**
   * Array of event IDs that are part of this pass package
   */
  @Column({ type: 'uuid', array: true })
  eventIds: string[];

  /**
   * Expiration date for this pass package
   */
  @Column({ type: 'timestamptz' })
  validUntil: Date;

  /**
   * Creator/organizer of this pass package
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column()
  createdBy: string;

  /**
   * Is this pass package active and available for purchase
   */
  @Column({ default: true })
  isActive: boolean;

  /**
   * Maximum number of this pass package that can be sold
   */
  @Column({ nullable: true, default: null })
  maxPackagesToSell: number | null;

  /**
   * Number of packages already sold
   */
  @Column({ default: 0 })
  packagesSold: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true, type: 'timestamptz', default: null })
  deletedAt: Date | null;
}

@Entity('user_pass_packages')
export class UserPassPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => PassPackage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'passPackageId' })
  passPackage: PassPackage;

  @Column()
  passPackageId: string;

  /**
   * Number of events this user can still attend using this pass
   */
  @Column()
  remainingAllowance: number;

  /**
   * Number of times this pass has been used
   */
  @Column({ default: 0 })
  usedCount: number;

  /**
   * Array of event IDs already attended with this pass
   */
  @Column({ type: 'uuid', array: true, default: () => 'ARRAY[]::uuid[]' })
  usedEventIds: string[];

  /**
   * Purchase/activation date
   */
  @CreateDateColumn()
  purchaseDate: Date;

  /**
   * When the pass expires (inherited from package but stored for quick lookup)
   */
  @Column({ type: 'timestamptz' })
  expiryDate: Date;

  /**
   * Payment transaction ID/hash
   */
  @Column({ nullable: true })
  transactionHash: string | null;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true, type: 'timestamptz', default: null })
  deletedAt: Date | null;
}
