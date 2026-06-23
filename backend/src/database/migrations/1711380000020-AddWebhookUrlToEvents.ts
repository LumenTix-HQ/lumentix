import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookUrlToEvents1711380000020 implements MigrationInterface {
  name = 'AddWebhookUrlToEvents1711380000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "webhookUrl" character varying NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "webhookUrl"`,
    );
  }
}
