import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates a partial unique index on the registrations table so that
 * (event_id, user_id) is unique for all non-cancelled registrations.
 * This enforces the database-level duplicate-registration prevention that
 * complements the application-level ConflictException check.
 */
export class AddUniqueRegistrationConstraint1748476800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_active_registration
        ON registrations(event_id, user_id)
        WHERE status != 'cancelled'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_active_registration`,
    );
  }
}
