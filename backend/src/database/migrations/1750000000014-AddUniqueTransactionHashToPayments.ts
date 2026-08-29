import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueTransactionHashToPayments1750000000014
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payments_transaction_hash_not_null"
      ON "payments" ("transaction_hash")
      WHERE "transaction_hash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_payments_transaction_hash_not_null"`,
    );
  }
}
