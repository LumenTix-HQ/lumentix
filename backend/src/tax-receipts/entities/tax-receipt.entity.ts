import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TaxFormat {
  VAT = 'vat',
  GST = 'gst',
  SALES_TAX = 'sales_tax',
  NONE = 'none',
}

export enum TaxReceiptStatus {
  PENDING = 'pending',
  GENERATED = 'generated',
  EMAILED = 'emailed',
  FAILED = 'failed',
}

/**
 * Stores generated tax receipts / invoices for ticket purchases (#1464).
 *
 * Table: tax_receipts
 */
@Entity({ name: 'tax_receipts' })
@Index(['userId', 'status'])
@Index(['paymentId'])
export class TaxReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The payment this receipt was issued for. */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  paymentId: string;

  /** The user who made the purchase. */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId: string;

  /** ISO 3166-1 alpha-2 country code used to select the tax regime. */
  @Column({ type: 'varchar', length: 8 })
  countryCode: string;

  /** Tax format applied (VAT / GST / sales_tax / none). */
  @Column({ type: 'varchar', length: 32, default: TaxFormat.NONE })
  taxFormat: TaxFormat;

  /** Gross purchase amount (before tax). */
  @Column({ type: 'decimal', precision: 18, scale: 7 })
  subtotal: number;

  /** Tax rate applied as a decimal fraction (e.g. 0.20 for 20 % VAT). */
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  taxRate: number;

  /** Computed tax amount = subtotal × taxRate. */
  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  taxAmount: number;

  /** Total = subtotal + taxAmount. */
  @Column({ type: 'decimal', precision: 18, scale: 7 })
  total: number;

  /** ISO 4217 currency code. */
  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  /** URL / path to the generated PDF receipt file. */
  @Column({ type: 'text', nullable: true })
  pdfUrl: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: TaxReceiptStatus,
    default: TaxReceiptStatus.PENDING,
  })
  status: TaxReceiptStatus;

  /** Structured line-item data stored for PDF re-generation. */
  @Column({ type: 'jsonb', nullable: true })
  receiptData: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
