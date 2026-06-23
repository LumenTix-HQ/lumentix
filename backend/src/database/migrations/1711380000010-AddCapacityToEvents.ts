import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCapacityToEvents1711380000010 implements MigrationInterface {
  name = 'AddCapacityToEvents1711380000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "maxAttendees" integer NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "maxAttendees"`,
    );
  }
}
