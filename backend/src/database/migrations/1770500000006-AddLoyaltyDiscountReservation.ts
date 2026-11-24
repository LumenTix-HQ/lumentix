import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the RESERVED discount status and the reservedAt timestamp. */
export class AddLoyaltyDiscountReservation1770500000006
  implements MigrationInterface
{
  name = 'AddLoyaltyDiscountReservation1770500000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "loyalty_discounts_status_enum" ADD VALUE IF NOT EXISTS 'reserved'`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_discounts" ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMPTZ`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "loyalty_discounts" SET "status" = 'active' WHERE "status" = 'reserved'`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_discounts" DROP COLUMN IF EXISTS "reservedAt"`,
    );
  }
}
