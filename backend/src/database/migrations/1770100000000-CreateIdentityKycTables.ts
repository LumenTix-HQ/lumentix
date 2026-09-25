import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the tables backing the decentralized identity / KYC module:
 *
 *   kyc_documents       — user-submitted identity documents pending admin review
 *   verified_credentials — DID-based credentials issued after KYC approval,
 *                          reusable across all events without re-submitting documents
 *
 * New columns vs the original stub (if the tables already exist from a prior
 * migration or synchronize run):
 *   kyc_documents      + reviewedBy, reviewerNotes, reviewedAt
 *   verified_credentials + revokedReason, issuedBy, UNIQUE(did), composite index
 */
export class CreateIdentityKycTables1770100000000 implements MigrationInterface {
  name = 'CreateIdentityKycTables1770100000000';

  // ── up ──────────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── document_type enum ────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "kyc_documents_documenttype_enum" AS ENUM (
          'PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE', 'RESIDENCE_PERMIT'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── kyc_status enum ───────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "kyc_documents_status_enum" AS ENUM (
          'PENDING', 'APPROVED', 'REJECTED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── credential_provider enum ──────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "verified_credentials_provider_enum" AS ENUM (
          'LUMENTIX', 'THIRD_PARTY'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── kyc_documents ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kyc_documents" (
        "id"             uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "userId"         uuid         NOT NULL,
        "documentType"   "kyc_documents_documenttype_enum" NOT NULL,
        "documentNumber" varchar      NOT NULL,
        "documentUrl"    text         DEFAULT NULL,
        "fullName"       varchar      DEFAULT NULL,
        "dateOfBirth"    varchar      DEFAULT NULL,
        "countryCode"    varchar      DEFAULT NULL,
        "status"         "kyc_documents_status_enum" NOT NULL DEFAULT 'PENDING',
        "reviewedBy"     uuid         DEFAULT NULL,
        "reviewerNotes"  text         DEFAULT NULL,
        "reviewedAt"     TIMESTAMPTZ  DEFAULT NULL,
        "submittedAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_documents_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kyc_documents_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kyc_documents_reviewedBy"
          FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_kyc_documents_userId"
        ON "kyc_documents" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_kyc_documents_status"
        ON "kyc_documents" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_kyc_documents_userId_status"
        ON "kyc_documents" ("userId", "status")
    `);

    // ── verified_credentials ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "verified_credentials" (
        "id"            uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "userId"        uuid         NOT NULL,
        "did"           varchar      DEFAULT NULL,
        "provider"      "verified_credentials_provider_enum" NOT NULL,
        "metadata"      text         DEFAULT NULL,
        "revoked"       boolean      NOT NULL DEFAULT false,
        "revokedReason" text         DEFAULT NULL,
        "expiresAt"     TIMESTAMPTZ  DEFAULT NULL,
        "issuedBy"      uuid         DEFAULT NULL,
        "issuedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verified_credentials_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_verified_credentials_did"   UNIQUE ("did"),
        CONSTRAINT "FK_verified_credentials_userId"
          FOREIGN KEY ("userId")   REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_verified_credentials_issuedBy"
          FOREIGN KEY ("issuedBy") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_verified_credentials_userId"
        ON "verified_credentials" ("userId")
    `);

    // Composite index powering the active-credential-per-provider uniqueness check
    // and the checkEventCredential query (userId, provider, revoked).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_verified_credentials_userId_provider_revoked"
        ON "verified_credentials" ("userId", "provider", "revoked")
    `);
  }

  // ── down ─────────────────────────────────────────────────────────────────────

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "verified_credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kyc_documents"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "verified_credentials_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_documents_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_documents_documenttype_enum"`);
  }
}
