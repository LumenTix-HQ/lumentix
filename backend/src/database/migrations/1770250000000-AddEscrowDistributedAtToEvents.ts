import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `events.escrowDistributedAt`.
 *
 * Records when the sponsor escrow for an event was paid out to the organizer.
 * The column doubles as an idempotency guard: `SponsorsService.distributeEscrow`
 * performs a conditional `UPDATE ... WHERE escrowDistributedAt IS NULL` and
 * only the request that flips it wins, so a retried or double-clicked request
 * cannot send the on-chain payout twice.
 */
export class AddEscrowDistributedAtToEvents1770250000000
  implements MigrationInterface
{
  name = 'AddEscrowDistributedAtToEvents1770250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "escrowDistributedAt" TIMESTAMP NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "escrowDistributedAt"`,
    );
  }
}
