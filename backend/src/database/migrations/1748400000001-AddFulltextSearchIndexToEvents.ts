import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFulltextSearchIndexToEvents1748400000001 implements MigrationInterface {
  name = 'AddFulltextSearchIndexToEvents1748400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_fulltext_search"
      ON "events"
      USING GIN (
        to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, ''))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_events_fulltext_search"`,
    );
  }
}
