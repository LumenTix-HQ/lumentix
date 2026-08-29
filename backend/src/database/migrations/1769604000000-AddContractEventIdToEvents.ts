import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractEventIdToEvents1769604000000 implements MigrationInterface {
  name = 'AddContractEventIdToEvents1769604000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "contractEventId" bigint,
      ADD COLUMN IF NOT EXISTS "onChainRefundVerifiedAt" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "events"
      DROP COLUMN IF EXISTS "onChainRefundVerifiedAt",
      DROP COLUMN IF EXISTS "contractEventId"
    `);
  }
}
