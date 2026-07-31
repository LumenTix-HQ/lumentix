import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TaxJurisdictionType {
  US_STATE = 'us_state',
  COUNTRY = 'country',
  MUNICIPAL = 'municipal',
}

/**
 * Persists the tax rule configuration for a jurisdiction.
 * Mirrors the on-chain TaxRule struct and acts as the source of truth
 * for the backend tax-determination service.
 */
@Index(['jurisdictionCode'])
@Entity('tax_rules')
export class TaxRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ISO 3166 country code or US state abbreviation (e.g. "US-CA", "DE") */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  jurisdictionCode: string;

  /** Human-readable name (e.g. "California", "Germany") */
  @Column({ type: 'varchar', length: 128 })
  jurisdictionName: string;

  @Column({ type: 'enum', enum: TaxJurisdictionType, default: TaxJurisdictionType.COUNTRY })
  jurisdictionType: TaxJurisdictionType;

  /** Tax rate expressed in basis points (e.g. 875 = 8.75%) */
  @Column({ type: 'int', default: 0 })
  rateBps: number;

  @Column({ default: true })
  isActive: boolean;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Immutable record of tax collected for a single ticket purchase.
 */
@Index(['jurisdictionCode', 'collectedAt'])
@Index(['eventId'])
@Entity('tax_collection_records')
export class TaxCollectionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** On-chain record_id returned by record_tax_collection */
  @Column({ type: 'bigint', nullable: true })
  onChainRecordId: number | null;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  ticketId: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  eventId: string;

  @Column({ type: 'varchar', length: 128 })
  purchaserAddress: string;

  /** Tax amount in the smallest unit of the currency */
  @Column({ type: 'decimal', precision: 18, scale: 7 })
  taxAmount: number;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 16 })
  jurisdictionCode: string;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  collectedAt: Date;

  @Column({ default: false })
  remitted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Generated tax report for a jurisdiction over a time window.
 */
@Entity('tax_reports')
export class TaxReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** On-chain report_id returned by export_tax_reports */
  @Column({ type: 'bigint', nullable: true })
  onChainReportId: number | null;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  jurisdictionCode: string;

  @Column({ type: 'int' })
  recordCount: number;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  totalTaxCollected: number;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'timestamptz' })
  periodEnd: Date;

  @Column({ type: 'varchar', length: 128 })
  exportedBy: string;

  @CreateDateColumn()
  generatedAt: Date;
}
