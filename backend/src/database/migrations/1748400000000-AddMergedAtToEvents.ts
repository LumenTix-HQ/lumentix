import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMergedAtToEvents1748400000000 implements MigrationInterface {
  name = 'AddMergedAtToEvents1748400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "mergedAt"`,
    );
  }
}
