import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignedXdrToPayments1769500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS "signedXdr" TEXT
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE payments DROP COLUMN IF EXISTS "signedXdr"`);
  }
}
