import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';

import {
  TaxFormat,
  TaxReceipt,
  TaxReceiptStatus,
} from './entities/tax-receipt.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { MailerService } from '../mailer/mailer.service';
import { GenerateTaxReceiptDto } from './dto/generate-tax-receipt.dto';
import { TaxReceiptResponseDto } from './dto/tax-receipt-response.dto';

// ─── Region tax rules (#1464) ──────────────────────────────────────────────

/**
 * A single regional tax rule. `rate` is a decimal fraction (0–1).
 * `format` identifies the tax regime for receipt labelling.
 */
interface RegionalTaxRule {
  format: TaxFormat;
  rate: number;
  label: string; // e.g. "VAT (20%)"
}

/**
 * Mapping of ISO 3166-1 alpha-2 country codes to their applicable tax rule.
 *
 * Sources:
 *   - EU VAT rates: https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en
 *   - AU GST: https://www.ato.gov.au (10 %)
 *   - US: per-state map; defaults applied here for common states.
 *
 * Extend this map to cover additional jurisdictions.
 */
const COUNTRY_TAX_RULES: Record<string, RegionalTaxRule> = {
  // EU members — standard VAT rate
  GB: { format: TaxFormat.VAT, rate: 0.20, label: 'VAT (20%)' },
  DE: { format: TaxFormat.VAT, rate: 0.19, label: 'VAT (19%)' },
  FR: { format: TaxFormat.VAT, rate: 0.20, label: 'TVA (20%)' },
  IT: { format: TaxFormat.VAT, rate: 0.22, label: 'IVA (22%)' },
  ES: { format: TaxFormat.VAT, rate: 0.21, label: 'IVA (21%)' },
  NL: { format: TaxFormat.VAT, rate: 0.21, label: 'BTW (21%)' },
  PL: { format: TaxFormat.VAT, rate: 0.23, label: 'VAT (23%)' },
  SE: { format: TaxFormat.VAT, rate: 0.25, label: 'Moms (25%)' },
  DK: { format: TaxFormat.VAT, rate: 0.25, label: 'Moms (25%)' },
  FI: { format: TaxFormat.VAT, rate: 0.255, label: 'ALV (25.5%)' },
  BE: { format: TaxFormat.VAT, rate: 0.21, label: 'TVA (21%)' },
  AT: { format: TaxFormat.VAT, rate: 0.20, label: 'MwSt (20%)' },
  PT: { format: TaxFormat.VAT, rate: 0.23, label: 'IVA (23%)' },
  IE: { format: TaxFormat.VAT, rate: 0.23, label: 'VAT (23%)' },
  GR: { format: TaxFormat.VAT, rate: 0.24, label: 'ΦΠΑ (24%)' },
  CZ: { format: TaxFormat.VAT, rate: 0.21, label: 'DPH (21%)' },
  RO: { format: TaxFormat.VAT, rate: 0.19, label: 'TVA (19%)' },
  HU: { format: TaxFormat.VAT, rate: 0.27, label: 'ÁFA (27%)' },
  // Oceania
  AU: { format: TaxFormat.GST, rate: 0.10, label: 'GST (10%)' },
  NZ: { format: TaxFormat.GST, rate: 0.15, label: 'GST (15%)' },
  // Asia-Pacific
  SG: { format: TaxFormat.GST, rate: 0.09, label: 'GST (9%)' },
  IN: { format: TaxFormat.GST, rate: 0.18, label: 'GST (18%)' },
  // Americas — US uses state-level sales tax (default 0 %; stateCode map below)
  US: { format: TaxFormat.SALES_TAX, rate: 0, label: 'Sales Tax' },
  CA: { format: TaxFormat.GST, rate: 0.05, label: 'GST/HST (5%)' },
  MX: { format: TaxFormat.VAT, rate: 0.16, label: 'IVA (16%)' },
  BR: { format: TaxFormat.VAT, rate: 0.17, label: 'ICMS (17%)' },
  // Africa
  ZA: { format: TaxFormat.VAT, rate: 0.15, label: 'VAT (15%)' },
  NG: { format: TaxFormat.VAT, rate: 0.075, label: 'VAT (7.5%)' },
  GH: { format: TaxFormat.VAT, rate: 0.125, label: 'VAT (12.5%)' },
  KE: { format: TaxFormat.VAT, rate: 0.16, label: 'VAT (16%)' },
};

/** US state-level combined sales-tax rates (approximate 2026 values). */
const US_STATE_TAX_RATES: Record<string, number> = {
  AL: 0.09, AK: 0.01, AZ: 0.085, AR: 0.095, CA: 0.0725,
  CO: 0.029, CT: 0.0635, DE: 0.00, FL: 0.06, GA: 0.04,
  HI: 0.04, ID: 0.06, IL: 0.0625, IN: 0.07, IA: 0.06,
  KS: 0.065, KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06,
  MA: 0.0625, MI: 0.06, MN: 0.0688, MS: 0.07, MO: 0.04225,
  MT: 0.00, NE: 0.055, NV: 0.0685, NH: 0.00, NJ: 0.0663,
  NM: 0.05125, NY: 0.04, NC: 0.0475, ND: 0.05, OH: 0.0575,
  OK: 0.045, OR: 0.00, PA: 0.06, RI: 0.07, SC: 0.06,
  SD: 0.042, TN: 0.07, TX: 0.0625, UT: 0.061, VT: 0.06,
  VA: 0.053, WA: 0.065, WV: 0.06, WI: 0.05, WY: 0.04,
  DC: 0.06,
};

/**
 * Automated tax receipt generation for ticket purchases (#1464).
 *
 * Exposes three named operations matching the issue spec:
 *   - generate_tax_receipt     — full end-to-end: apply rules, build PDF,
 *                                persist record.
 *   - apply_regional_tax_rules — pure function; returns the applicable rule
 *                                for a country/state combination.
 *   - email_tax_receipt        — send a previously generated receipt to the
 *                                user's email address.
 */
@Injectable()
export class TaxReceiptsService {
  private readonly logger = new Logger(TaxReceiptsService.name);

  constructor(
    @InjectRepository(TaxReceipt)
    private readonly receiptRepo: Repository<TaxReceipt>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailerService: MailerService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Generate, persist, and optionally email a region-specific tax receipt for
   * a confirmed ticket purchase (#1464).
   *
   * Pipeline:
   *   1. Load and validate the payment.
   *   2. apply_regional_tax_rules → determine format, rate, amounts.
   *   3. Build the PDF bytes in memory.
   *   4. Persist the receipt record (pdfUrl stubbed — attach a real storage
   *      adapter such as S3 to persist the bytes externally).
   *   5. If `recipientEmail` is provided, email_tax_receipt immediately.
   */
  async generateTaxReceipt(
    userId: string,
    dto: GenerateTaxReceiptDto,
  ): Promise<TaxReceiptResponseDto> {
    const payment = await this.paymentRepo.findOne({
      where: { id: dto.paymentId },
    });
    if (!payment) {
      throw new NotFoundException(`Payment "${dto.paymentId}" not found.`);
    }
    if (payment.userId !== userId) {
      throw new BadRequestException(
        'You can only generate receipts for your own payments.',
      );
    }
    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new BadRequestException(
        `Payment must be CONFIRMED to generate a receipt (current: "${payment.status}").`,
      );
    }

    // Check for duplicate receipt generation.
    const existing = await this.receiptRepo.findOne({
      where: { paymentId: dto.paymentId, userId },
    });
    if (existing && existing.status === TaxReceiptStatus.GENERATED) {
      return this.toDto(existing);
    }

    const taxRule = this.applyRegionalTaxRules(dto.countryCode, dto.stateCode);
    const subtotal = Number(payment.amount);
    const taxAmount = parseFloat((subtotal * taxRule.rate).toFixed(7));
    const total = parseFloat((subtotal + taxAmount).toFixed(7));

    const receiptData: Record<string, unknown> = {
      paymentId: payment.id,
      userId,
      countryCode: dto.countryCode,
      stateCode: dto.stateCode ?? null,
      taxFormat: taxRule.format,
      taxLabel: taxRule.label,
      taxRate: taxRule.rate,
      subtotal,
      taxAmount,
      total,
      currency: payment.currency,
      issuedAt: new Date().toISOString(),
    };

    // Build PDF in memory.
    const pdfBuffer = await this._buildPdf(receiptData);
    // In production: upload pdfBuffer to S3/GCS and store the CDN URL.
    // Here we store a placeholder URL referencing the receipt id.
    const receiptRecord = existing ?? this.receiptRepo.create({});
    receiptRecord.paymentId = payment.id;
    receiptRecord.userId = userId;
    receiptRecord.countryCode = dto.countryCode;
    receiptRecord.taxFormat = taxRule.format;
    receiptRecord.subtotal = subtotal;
    receiptRecord.taxRate = taxRule.rate;
    receiptRecord.taxAmount = taxAmount;
    receiptRecord.total = total;
    receiptRecord.currency = payment.currency;
    receiptRecord.receiptData = receiptData;
    receiptRecord.status = TaxReceiptStatus.GENERATED;
    // pdfUrl is a placeholder; replace with a real CDN URL from your storage layer.
    receiptRecord.pdfUrl = null;

    const saved = await this.receiptRepo.save(receiptRecord);
    this.logger.log(
      `Tax receipt ${saved.id} generated for payment ${payment.id} ` +
        `(${taxRule.label}, total ${total} ${payment.currency})`,
    );

    // Optionally send immediately if the caller provided a recipient email.
    if (dto.recipientEmail) {
      await this.emailTaxReceipt(saved.id, dto.recipientEmail, pdfBuffer);
    }

    return this.toDto(saved);
  }

  /**
   * Pure function — resolve the applicable tax rule for a country/state pair
   * without any side-effects (#1464).
   *
   * @param countryCode  ISO 3166-1 alpha-2 code.
   * @param stateCode    Two-letter US state abbreviation (only used when
   *                     countryCode === 'US').
   * @returns            The matching RegionalTaxRule, or a NONE/0 % rule if
   *                     the jurisdiction is unknown.
   */
  applyRegionalTaxRules(
    countryCode: string,
    stateCode?: string,
  ): RegionalTaxRule {
    const upper = countryCode.toUpperCase();
    const base = COUNTRY_TAX_RULES[upper];

    if (!base) {
      return { format: TaxFormat.NONE, rate: 0, label: 'No tax applicable' };
    }

    // US: override with state-level rate when a stateCode is provided.
    if (upper === 'US' && stateCode) {
      const stateRate = US_STATE_TAX_RATES[stateCode.toUpperCase()];
      if (stateRate !== undefined) {
        return {
          format: TaxFormat.SALES_TAX,
          rate: stateRate,
          label: `Sales Tax (${(stateRate * 100).toFixed(2)}%)`,
        };
      }
    }

    return base;
  }

  /**
   * Send a previously generated tax receipt as a PDF email attachment (#1464).
   *
   * @param receiptId      Internal receipt UUID.
   * @param recipientEmail Override email; falls back to the user's registered
   *                       address if not supplied.
   * @param pdfBuffer      Pre-built PDF bytes; if omitted, the PDF is rebuilt
   *                       from the stored receiptData.
   */
  async emailTaxReceipt(
    receiptId: string,
    recipientEmail?: string,
    pdfBuffer?: Buffer,
  ): Promise<TaxReceiptResponseDto> {
    const receipt = await this.receiptRepo.findOne({
      where: { id: receiptId },
    });
    if (!receipt) {
      throw new NotFoundException(`Tax receipt "${receiptId}" not found.`);
    }
    if (receipt.status === TaxReceiptStatus.PENDING) {
      throw new BadRequestException(
        'Receipt PDF has not been generated yet. Call generate_tax_receipt first.',
      );
    }

    let toEmail = recipientEmail;
    if (!toEmail) {
      const user = await this.userRepo.findOne({ where: { id: receipt.userId } });
      if (!user) {
        throw new NotFoundException(`User "${receipt.userId}" not found.`);
      }
      toEmail = user.email;
    }

    const pdf =
      pdfBuffer ?? (await this._buildPdf(receipt.receiptData ?? {}));

    await this.mailerService.send({
      to: toEmail,
      subject: `Your tax receipt — ${receipt.taxFormat.toUpperCase()} (${receipt.currency})`,
      html: `
        <p>Dear customer,</p>
        <p>Please find your tax receipt attached to this email.</p>
        <p><strong>Tax format:</strong> ${receipt.taxFormat.toUpperCase()}<br/>
           <strong>Subtotal:</strong> ${receipt.subtotal} ${receipt.currency}<br/>
           <strong>Tax (${(receipt.taxRate * 100).toFixed(2)} %):</strong> ${receipt.taxAmount} ${receipt.currency}<br/>
           <strong>Total:</strong> ${receipt.total} ${receipt.currency}</p>
        <p>Thank you for your purchase.</p>
      `,
      attachments: [
        {
          filename: `receipt-${receiptId}.pdf`,
          content: pdf.toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    receipt.status = TaxReceiptStatus.EMAILED;
    receipt.emailedAt = new Date();
    const saved = await this.receiptRepo.save(receipt);

    this.logger.log(`Tax receipt ${receiptId} emailed to ${toEmail}`);
    return this.toDto(saved);
  }

  /** List all receipts for the authenticated user. */
  async getReceiptsForUser(userId: string): Promise<TaxReceiptResponseDto[]> {
    const receipts = await this.receiptRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return receipts.map((r) => this.toDto(r));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build a PDF receipt buffer using pdfkit (#1464).
   * The PDF includes issuer details, line items, and the tax breakdown.
   */
  private _buildPdf(data: Record<string, unknown>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(22).font('Helvetica-Bold').text('LumenTix', { align: 'center' });
      doc.fontSize(16).font('Helvetica').text('Tax Receipt / Invoice', { align: 'center' });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Metadata
      const issuedAt = data.issuedAt ?? new Date().toISOString();
      const paymentId = data.paymentId ?? 'N/A';
      doc.fontSize(10).font('Helvetica');
      doc.text(`Issued: ${issuedAt}`);
      doc.text(`Payment ID: ${paymentId}`);
      doc.text(`Country: ${data.countryCode ?? 'N/A'}`);
      if (data.stateCode) doc.text(`State: ${data.stateCode}`);
      doc.moveDown();

      // Line items
      doc.fontSize(12).font('Helvetica-Bold').text('Summary');
      doc.fontSize(10).font('Helvetica');
      doc.moveDown(0.5);

      const currency = String(data.currency ?? 'USD');
      const subtotal = Number(data.subtotal ?? 0).toFixed(2);
      const taxLabel = String(data.taxLabel ?? 'Tax');
      const taxAmount = Number(data.taxAmount ?? 0).toFixed(2);
      const total = Number(data.total ?? 0).toFixed(2);

      doc.text(`Subtotal:   ${subtotal} ${currency}`);
      doc.text(`${taxLabel}:   ${taxAmount} ${currency}`);
      doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).stroke();
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').text(`Total:   ${total} ${currency}`);

      doc.end();
    });
  }

  private toDto(receipt: TaxReceipt): TaxReceiptResponseDto {
    return {
      id: receipt.id,
      paymentId: receipt.paymentId,
      userId: receipt.userId,
      countryCode: receipt.countryCode,
      taxFormat: receipt.taxFormat,
      subtotal: Number(receipt.subtotal),
      taxRate: Number(receipt.taxRate),
      taxAmount: Number(receipt.taxAmount),
      total: Number(receipt.total),
      currency: receipt.currency,
      pdfUrl: receipt.pdfUrl,
      status: receipt.status,
      emailedAt: receipt.emailedAt?.toISOString() ?? null,
      createdAt: receipt.createdAt.toISOString(),
    };
  }
}
