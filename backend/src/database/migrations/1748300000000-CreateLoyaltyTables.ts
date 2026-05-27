import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyaltyTables1748300000000 implements MigrationInterface {
  name = 'CreateLoyaltyTables1748300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── loyalty_accounts ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "loyalty_accounts" (
        "id"                   UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"               UUID              NOT NULL,
        "pointsBalance"        INTEGER           NOT NULL DEFAULT 0,
        "totalPointsEarned"    INTEGER           NOT NULL DEFAULT 0,
        "totalPointsRedeemed"  INTEGER           NOT NULL DEFAULT 0,
        "lastActivityAt"       TIMESTAMPTZ,
        "createdAt"            TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMPTZ       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_loyalty_accounts_userId" UNIQUE ("userId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_accounts_userId" ON "loyalty_accounts" ("userId")
    `);

    // ── loyalty_transactions ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "loyalty_transactions_type_enum" AS ENUM ('earn', 'redeem', 'expire')
    `);

    await queryRunner.query(`
      CREATE TABLE "loyalty_transactions" (
        "id"            UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"        UUID              NOT NULL,
        "type"          "loyalty_transactions_type_enum" NOT NULL,
        "points"        INTEGER           NOT NULL,
        "balanceAfter"  INTEGER           NOT NULL,
        "description"   VARCHAR(255)      NOT NULL,
        "eventId"       UUID,
        "discountId"    UUID,
        "createdAt"     TIMESTAMPTZ       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_transactions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_transactions_userId" ON "loyalty_transactions" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_transactions_userId_createdAt"
        ON "loyalty_transactions" ("userId", "createdAt")
    `);

    // ── loyalty_discounts ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "loyalty_discounts_status_enum" AS ENUM ('active', 'used', 'expired')
    `);

    await queryRunner.query(`
      CREATE TABLE "loyalty_discounts" (
        "id"              UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"          UUID              NOT NULL,
        "code"            VARCHAR(32)       NOT NULL,
        "discountPercent" DECIMAL(5,2)      NOT NULL,
        "pointsSpent"     INTEGER           NOT NULL,
        "status"          "loyalty_discounts_status_enum" NOT NULL DEFAULT 'active',
        "expiresAt"       TIMESTAMPTZ       NOT NULL,
        "usedOnEventId"   UUID,
        "createdAt"       TIMESTAMPTZ       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_discounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_loyalty_discounts_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_discounts_userId" ON "loyalty_discounts" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "loyalty_discounts"`);
    await queryRunner.query(`DROP TYPE "loyalty_discounts_status_enum"`);
    await queryRunner.query(`DROP TABLE "loyalty_transactions"`);
    await queryRunner.query(`DROP TYPE "loyalty_transactions_type_enum"`);
    await queryRunner.query(`DROP TABLE "loyalty_accounts"`);
  }
}
