import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationPreferencesToUser1711380000000
  implements MigrationInterface
{
  name = 'AddNotificationPreferencesToUser1711380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "notificationPreferences" jsonb NOT NULL DEFAULT '{"ticketIssued": true, "paymentFailed": true, "eventCancelled": true, "sponsorConfirmed": true, "eventCompleted": true}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "notificationPreferences"`,
    );
  }
}
