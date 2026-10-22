import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TaxReceipt } from './entities/tax-receipt.entity';
import { TaxReceiptsService } from './tax-receipts.service';
import { TaxReceiptsController } from './tax-receipts.controller';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { MailerModule } from '../mailer/mailer.module';

/**
 * Automated tax receipt generation for ticket purchases (#1464).
 *
 * Supports VAT, GST, and sales-tax regimes with PDF download and email
 * delivery:
 *   POST /tax-receipts              → generate_tax_receipt
 *   GET  /tax-receipts/me           → list my receipts
 *   POST /tax-receipts/:id/email    → email_tax_receipt
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TaxReceipt, Payment, User]),
    MailerModule,
  ],
  providers: [TaxReceiptsService],
  controllers: [TaxReceiptsController],
  exports: [TaxReceiptsService],
})
export class TaxReceiptsModule {}
