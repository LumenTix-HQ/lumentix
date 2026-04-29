import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventCategoryColumn1743330000000 implements MigrationInterface {
  name = 'AddEventCategoryColumn1743330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."events_category_enum" AS ENUM(
        'conference', 'workshop', 'meetup', 'concert', 'sports', 'festival', 'other'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "events"
      ADD COLUMN "category" "public"."events_category_enum" NOT NULL DEFAULT 'other'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "category"`);
    await queryRunner.query(`DROP TYPE "public"."events_category_enum"`);
  }
}
