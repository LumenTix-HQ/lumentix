import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tables backing FraudDetectionModule (flagged_transactions) and
 * PassPackagesModule (pass_packages, user_pass_packages). Both modules
 * shipped without migrations and were never registered in AppModule (#1124).
 */
export class CreateFraudDetectionAndPassPackages1770000000010 implements MigrationInterface {
  name = 'CreateFraudDetectionAndPassPackages1770000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── flagged_transactions ────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "flagged_transactions_flagreason_enum" AS ENUM (
          'WASH_TRADING', 'BOT_ACTIVITY', 'SUSPICIOUS_PRICING',
          'UNUSUAL_VELOCITY', 'PATTERN_MATCHING'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "flagged_transactions_status_enum" AS ENUM (
          'pending', 'reviewed', 'cleared', 'confirmed_fraud', 'action_taken'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "flagged_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionHash" varchar NOT NULL,
        "eventId" uuid,
        "sellerId" uuid,
        "buyerId" uuid,
        "originalPrice" decimal(10,2) NOT NULL,
        "salePrice" decimal(10,2) NOT NULL,
        "flagReason" "flagged_transactions_flagreason_enum" NOT NULL,
        "riskScore" decimal(3,2) NOT NULL,
        "fraudIndicators" jsonb DEFAULT NULL,
        "status" "flagged_transactions_status_enum" NOT NULL DEFAULT 'pending',
        "reviewNotes" text DEFAULT NULL,
        "reviewedBy" uuid,
        "actionTaken" jsonb DEFAULT NULL,
        "flaggedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "reviewedAt" TIMESTAMPTZ DEFAULT NULL,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_flagged_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_flagged_transactions_eventId" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_flagged_transactions_sellerId" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_flagged_transactions_buyerId" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_flagged_transactions_reviewedBy" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_flagged_transactions_transactionHash" ON "flagged_transactions" ("transactionHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_flagged_transactions_eventId" ON "flagged_transactions" ("eventId")`,
    );

    // ── pass_packages ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pass_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "description" text NOT NULL,
        "price" decimal(10,2) NOT NULL,
        "currency" varchar NOT NULL DEFAULT 'USD',
        "eventsAllowed" integer NOT NULL,
        "totalEvents" integer NOT NULL,
        "eventIds" uuid[] NOT NULL,
        "validUntil" TIMESTAMPTZ NOT NULL,
        "createdBy" uuid NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "maxPackagesToSell" integer DEFAULT NULL,
        "packagesSold" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ DEFAULT NULL,
        CONSTRAINT "PK_pass_packages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pass_packages_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pass_packages_name" ON "pass_packages" ("name")`,
    );

    // ── user_pass_packages ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_pass_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "passPackageId" uuid NOT NULL,
        "remainingAllowance" integer NOT NULL,
        "usedCount" integer NOT NULL DEFAULT 0,
        "usedEventIds" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
        "purchaseDate" TIMESTAMP NOT NULL DEFAULT now(),
        "expiryDate" TIMESTAMPTZ NOT NULL,
        "transactionHash" varchar,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ DEFAULT NULL,
        CONSTRAINT "PK_user_pass_packages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_pass_packages_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_pass_packages_passPackageId" FOREIGN KEY ("passPackageId") REFERENCES "pass_packages"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_pass_packages_userId" ON "user_pass_packages" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_pass_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pass_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "flagged_transactions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "flagged_transactions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "flagged_transactions_flagreason_enum"`,
    );
  }
}
