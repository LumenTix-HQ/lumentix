import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePersistedXdrs1770500000007 implements MigrationInterface {
  name = 'CreatePersistedXdrs1770500000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "persisted_xdrs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "xdr" text NOT NULL,
        "networkPassphrase" character varying NOT NULL,
        "transactionHash" character varying,
        "status" character varying NOT NULL DEFAULT 'pending',
        "retryCount" integer NOT NULL DEFAULT 0,
        "lastError" text,
        "nextRetryAt" TIMESTAMPTZ,
        "paymentId" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_persisted_xdrs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_persisted_xdrs_status" ON "persisted_xdrs" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_persisted_xdrs_status_createdAt" ON "persisted_xdrs" ("status", "createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "persisted_xdrs"`);
  }
}
