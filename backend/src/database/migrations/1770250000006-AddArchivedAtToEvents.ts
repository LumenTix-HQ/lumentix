import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `archivedAt` timestamp to `events`, populated when a completed
 * event is archived (COMPLETED → ARCHIVED).
 */
export class AddArchivedAtToEvents1770250000006 implements MigrationInterface {
  name = 'AddArchivedAtToEvents1770250000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "archivedAt"`,
    );
  }
}
