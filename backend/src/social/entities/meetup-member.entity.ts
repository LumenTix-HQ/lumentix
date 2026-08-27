import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum MeetupMemberRole {
  CREATOR = 'creator',
  MEMBER = 'member',
}

@Index(['groupId', 'userId'], { unique: true })
@Entity('meetup_members')
export class MeetupMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  groupId: string;

  @Index()
  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: MeetupMemberRole,
    default: MeetupMemberRole.MEMBER,
  })
  role: MeetupMemberRole;

  @CreateDateColumn()
  joinedAt: Date;
}
