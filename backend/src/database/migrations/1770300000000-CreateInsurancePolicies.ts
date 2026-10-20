import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInsurancePolicies1770300000000 implements MigrationInterface {
  name = 'CreateInsurancePolicies1770300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."insurance_policies_status_enum" AS ENUM('active', 'claimed', 'expired', 'cancelled')`,
    );
    await queryRunner.query(`
      CREATE TABLE "insurance_policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ticketId" character varying(128) NOT NULL,
        "eventId" character varying(128) NOT NULL,
        "userId" character varying(128) NOT NULL,
        "premiumPaid" numeric(18,7) NOT NULL,
        "coverageAmount" numeric(18,7) NOT NULL,
        "currency" character varying(16) NOT NULL DEFAULT 'XLM',
        "status" "public"."insurance_policies_status_enum" NOT NULL DEFAULT 'active',
        "claimReason" character varying,
        "premiumTransactionHash" character varying,
        "claimTransactionHash" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_insurance_policies_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_insurance_policies_ticketId_unique" ON "insurance_policies" ("ticketId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_insurance_policies_eventId" ON "insurance_policies" ("eventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_insurance_policies_userId" ON "insurance_policies" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_insurance_policies_userId_status" ON "insurance_policies" ("userId", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_insurance_policies_userId_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_insurance_policies_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_insurance_policies_eventId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_insurance_policies_ticketId_unique"`);
    await queryRunner.query(`DROP TABLE "insurance_policies"`);
    await queryRunner.query(`DROP TYPE "public"."insurance_policies_status_enum"`);
  }
}
