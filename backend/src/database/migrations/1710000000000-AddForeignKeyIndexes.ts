import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddForeignKeyIndexes1710000000000
  implements MigrationInterface
{
  name = 'AddForeignKeyIndexes1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_EVENT_ID"
      ON "payments" ("eventId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_USER_ID"
      ON "payments" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_EVENT_STATUS"
      ON "payments" ("eventId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_PAYMENT_EVENT_STATUS"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_PAYMENT_USER_ID"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_PAYMENT_EVENT_ID"
    `);
  }
}