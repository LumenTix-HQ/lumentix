import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationChannelPreferences1769603000000 implements MigrationInterface {
  name = 'AddNotificationChannelPreferences1769603000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "channelNotificationPreferences" jsonb NOT NULL DEFAULT '{"push":{},"email":{},"sms":{},"in_app":{}}',
      ADD COLUMN IF NOT EXISTS "quietHours" jsonb NOT NULL DEFAULT '{"enabled":false,"start":"22:00","end":"08:00","timezone":"UTC"}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "quietHours",
      DROP COLUMN IF EXISTS "channelNotificationPreferences"
    `);
  }
}
