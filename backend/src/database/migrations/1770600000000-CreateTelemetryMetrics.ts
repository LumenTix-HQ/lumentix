import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelemetryMetrics1770600000000 implements MigrationInterface {
  name = 'CreateTelemetryMetrics1770600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telemetry_metrics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "metricType" character varying(32) NOT NULL,
        "service" character varying(64) NOT NULL,
        "value" numeric(18,3) NOT NULL,
        "unit" character varying(32),
        "tags" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telemetry_metrics_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_telemetry_metrics_metricType_createdAt" ON "telemetry_metrics" ("metricType", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_telemetry_metrics_service_createdAt" ON "telemetry_metrics" ("service", "createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_metrics"`);
  }
}
