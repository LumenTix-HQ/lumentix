import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDataDeletionRequests1769700000030 implements MigrationInterface {
  name = 'CreateDataDeletionRequests1769700000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "data_deletion_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "requestedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_data_deletion_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_data_deletion_requests_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_data_deletion_requests_userId" ON "data_deletion_requests" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "data_deletion_requests"`);
  }
}
