import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `event_history` table to persist snapshots of archived events
 * and their key aggregates for historical analysis.
 */
export class CreateEventHistoryTable1770250000005 implements MigrationInterface {
  name = 'CreateEventHistoryTable1770250000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_history" (
        "id"                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "eventId"           uuid NOT NULL,
        "snapshot"          jsonb NOT NULL,
        "ticketSummary"     jsonb NULL DEFAULT NULL,
        "paymentSummary"    jsonb NULL DEFAULT NULL,
        "sponsorshipSummary" jsonb NULL DEFAULT NULL,
        "totalTicketsSold"  integer NOT NULL DEFAULT 0,
        "totalTicketsUsed"  integer NOT NULL DEFAULT 0,
        "totalRevenue"      numeric(18,8) NOT NULL DEFAULT 0,
        "totalSponsorship"  numeric(18,8) NOT NULL DEFAULT 0,
        "archivedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_event_history_eventId" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_event_history_eventId" ON "event_history" ("eventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_event_history_eventId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "event_history"`);
  }
}
