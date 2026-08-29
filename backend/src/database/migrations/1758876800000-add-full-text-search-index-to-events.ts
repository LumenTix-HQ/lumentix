
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullTextSearchIndexToEvents1758876800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "events"
      ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_events_search_vector" ON "events" USING GIN("search_vector")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_events_search_vector"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "search_vector"`,
    );
  }
}