import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookDeadLetters1769700000000 implements MigrationInterface {
  name = 'CreateWebhookDeadLetters1769700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_dead_letters" (
        "id"              UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "eventId"         UUID              NOT NULL,
        "paymentId"       UUID              NOT NULL,
        "payload"         JSONB             NOT NULL,
        "lastStatusCode"  INTEGER,
        "lastError"       TEXT,
        "attempts"        INTEGER           NOT NULL,
        "createdAt"       TIMESTAMPTZ       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_dead_letters" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_webhook_dead_letters_eventId" ON "webhook_dead_letters" ("eventId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_webhook_dead_letters_paymentId" ON "webhook_dead_letters" ("paymentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_dead_letters"`);
  }
}
