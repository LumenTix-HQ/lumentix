import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReviewableType {
  EVENT = 'EVENT',
  VENUE = 'VENUE',
}

@Entity('reviews')
@Index(['reviewableType', 'reviewableId'])
@Index(['authorId', 'reviewableType', 'reviewableId'], { unique: true })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The user who wrote this review */
  @Column()
  authorId: string;

  /** Whether this is a review of an EVENT or a VENUE */
  @Column({ type: 'enum', enum: ReviewableType })
  reviewableType: ReviewableType;

  /** ID of the event or venue being reviewed */
  @Column()
  reviewableId: string;

  /** 1–5 star rating */
  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  /** Whether the review has been moderated / is publicly visible */
  @Column({ default: true })
  isPublished: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
