import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DocumentType } from '../dto/kyc.dto';

export enum KycStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Index(['userId'])
@Entity('kyc_documents')
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar' })
  documentType: DocumentType;

  @Column()
  documentNumber: string;

  @Column({ type: 'text', nullable: true })
  documentUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', nullable: true })
  countryCode: string | null;

  @Column({ type: 'varchar', default: KycStatus.PENDING })
  status: KycStatus;

  @CreateDateColumn()
  submittedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
