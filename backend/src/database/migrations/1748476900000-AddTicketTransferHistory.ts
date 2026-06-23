import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `owner_public_key` and `transfer_history` columns to the tickets table
 * to support the on-chain ticket transfer feature (issue #471).
 */
export class AddTicketTransferHistory1748476900000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS owner_public_key VARCHAR(64),
        ADD COLUMN IF NOT EXISTS transfer_history JSONB NOT NULL DEFAULT '[]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tickets
        DROP COLUMN IF EXISTS transfer_history,
        DROP COLUMN IF EXISTS owner_public_key
    `);
  }
}
