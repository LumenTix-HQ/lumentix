import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullTextSearchIndexToEvents1748476800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // GIN index on the computed tsvector for fast full-text search on title + description
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_fts
       ON events
       USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_events_fts`,
    );
  }
}
