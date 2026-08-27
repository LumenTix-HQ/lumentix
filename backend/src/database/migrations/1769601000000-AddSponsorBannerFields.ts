import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSponsorBannerFields1769601000000 implements MigrationInterface {
  name = 'AddSponsorBannerFields1769601000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sponsors"
      ADD COLUMN IF NOT EXISTS "weight" integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "impressionCount" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "clickCount" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sponsors"
      DROP COLUMN IF EXISTS "clickCount",
      DROP COLUMN IF EXISTS "impressionCount",
      DROP COLUMN IF EXISTS "isActive",
      DROP COLUMN IF EXISTS "weight"
    `);
  }
}
