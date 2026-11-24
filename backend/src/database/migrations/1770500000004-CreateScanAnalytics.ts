import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScanAnalytics1770500000004 implements MigrationInterface {
  name = 'CreateScanAnalytics1770500000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scan_metrics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "gateId" varchar(64),
        "scansPerMinute" integer NOT NULL,
        "avgScanTimeMs" numeric(10,2) NOT NULL,
        "totalScansInWindow" integer NOT NULL DEFAULT 0,
        "failedScans" integer NOT NULL DEFAULT 0,
        "errorRate" numeric(5,2) NOT NULL DEFAULT 0,
        "recordedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_scan_metrics_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_scan_metrics_eventId" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scan_metrics_eventId_recordedAt" ON "scan_metrics" ("eventId", "recordedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scan_metrics_eventId_gateId" ON "scan_metrics" ("eventId", "gateId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scan_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" varchar(128) NOT NULL,
        "gateId" varchar(64) NOT NULL,
        "ticketId" varchar(128) NOT NULL,
        "scannedBy" varchar(128),
        "scannedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_scan_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scan_events_eventId" ON "scan_events" ("eventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scan_events_eventId_gateId_scannedAt" ON "scan_events" ("eventId", "gateId", "scannedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "scan_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scan_metrics"`);
  }
}
