import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategories1750000000012 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL UNIQUE,
        slug VARCHAR NOT NULL UNIQUE,
        description TEXT,
        "iconUrl" VARCHAR
      )
    `);
    await queryRunner.query(`
      CREATE TABLE event_categories (
        "eventId" UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        "categoryId" UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY ("eventId", "categoryId")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE event_categories`);
    await queryRunner.query(`DROP TABLE categories`);
  }
}
