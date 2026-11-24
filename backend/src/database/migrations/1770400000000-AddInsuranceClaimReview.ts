import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supports auto-adjudication escalation: claims that fail the automatic rules
 * move to `under_review` with the escalation reason, and a human reviewer's
 * decision (approve → claimed, reject → claim_rejected) is recorded.
 */
export class AddInsuranceClaimReview1770400000000 implements MigrationInterface {
  name = 'AddInsuranceClaimReview1770400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."insurance_policies_status_enum" ADD VALUE IF NOT EXISTS 'under_review'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."insurance_policies_status_enum" ADD VALUE IF NOT EXISTS 'claim_rejected'`,
    );
    await queryRunner.query(`
      ALTER TABLE "insurance_policies"
        ADD COLUMN "escalationReason" character varying,
        ADD COLUMN "escalatedAt" TIMESTAMP,
        ADD COLUMN "reviewedBy" character varying(128),
        ADD COLUMN "reviewedAt" TIMESTAMP,
        ADD COLUMN "reviewNote" character varying
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "insurance_policies"
        DROP COLUMN "reviewNote",
        DROP COLUMN "reviewedAt",
        DROP COLUMN "reviewedBy",
        DROP COLUMN "escalatedAt",
        DROP COLUMN "escalationReason"
    `);
    // Postgres can't drop enum values: return affected policies to a prior
    // state, then rebuild the type without the review values.
    await queryRunner.query(
      `UPDATE "insurance_policies" SET "status" = 'active' WHERE "status" IN ('under_review', 'claim_rejected')`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."insurance_policies_status_enum" RENAME TO "insurance_policies_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."insurance_policies_status_enum" AS ENUM('active', 'claimed', 'expired', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_policies" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_policies" ALTER COLUMN "status" TYPE "public"."insurance_policies_status_enum" USING "status"::text::"public"."insurance_policies_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_policies" ALTER COLUMN "status" SET DEFAULT 'active'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."insurance_policies_status_enum_old"`,
    );
  }
}
