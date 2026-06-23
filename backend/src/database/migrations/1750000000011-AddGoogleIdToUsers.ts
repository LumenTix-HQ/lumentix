import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleIdToUsers1750000000011 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "googleId" VARCHAR UNIQUE
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "googleId"`);
  }
}
