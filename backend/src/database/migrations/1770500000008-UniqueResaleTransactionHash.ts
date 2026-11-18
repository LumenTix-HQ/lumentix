import { MigrationInterface, QueryRunner } from 'typeorm';

/** One on-chain payment may fund only one resale purchase. */
export class UniqueResaleTransactionHash1770500000008
  implements MigrationInterface
{
  name = 'UniqueResaleTransactionHash1770500000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resale_transactions_transactionHash" ON "resale_transactions" ("transactionHash") WHERE "transactionHash" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_resale_transactions_transactionHash"`,
    );
  }
}
