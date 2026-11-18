import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the `pending_payment` policy status used until the premium is paid. */
export class AddInsurancePendingPayment1770500000005
  implements MigrationInterface
{
  name = 'AddInsurancePendingPayment1770500000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."insurance_policies_status_enum" ADD VALUE IF NOT EXISTS 'pending_payment'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot drop enum values; unpaid policies simply become void.
    await queryRunner.query(
      `UPDATE "insurance_policies" SET "status" = 'cancelled' WHERE "status" = 'pending_payment'`,
    );
  }
}
