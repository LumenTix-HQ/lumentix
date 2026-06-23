import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSponsorProfileFields1750000000013 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sponsors
        ADD COLUMN IF NOT EXISTS "displayName" VARCHAR,
        ADD COLUMN IF NOT EXISTS "logoUrl" VARCHAR,
        ADD COLUMN IF NOT EXISTS "websiteUrl" VARCHAR
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sponsors
        DROP COLUMN IF EXISTS "displayName",
        DROP COLUMN IF EXISTS "logoUrl",
        DROP COLUMN IF EXISTS "websiteUrl"
    `);
  }
}
