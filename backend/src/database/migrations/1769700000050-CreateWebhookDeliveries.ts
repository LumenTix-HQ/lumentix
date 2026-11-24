import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookDeliveries1769700000050 implements MigrationInterface {
  name = 'CreateWebhookDeliveries1769700000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id"              UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "eventId"         UUID              NOT NULL,
        "paymentId"       UUID              NOT NULL,
        "attempt"         INTEGER           NOT NULL,
        "statusCode"      INTEGER,
        "responseBody"    TEXT,
        "sentAt"          TIMESTAMPTZ       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_deliveries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_webhook_deliveries_eventId" ON "webhook_deliveries" ("eventId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_webhook_deliveries_paymentId" ON "webhook_deliveries" ("paymentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
  }
}