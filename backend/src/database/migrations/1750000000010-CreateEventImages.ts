import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventImages1750000000010 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE event_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "eventId" UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        url VARCHAR NOT NULL,
        alt VARCHAR,
        "order" INT DEFAULT 0,
        "isPrimary" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMPTZ DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_event_images_event_id ON event_images("eventId")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE event_images`);
  }
}
