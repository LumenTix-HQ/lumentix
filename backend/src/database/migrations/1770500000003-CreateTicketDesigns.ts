import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTicketDesigns1770500000003 implements MigrationInterface {
  name = 'CreateTicketDesigns1770500000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "ticket_designs_backgroundpattern_enum" AS ENUM ('solid', 'dots', 'waves', 'gradient', 'custom_image');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ticket_designs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "name" varchar(128) NOT NULL,
        "backgroundPattern" "ticket_designs_backgroundpattern_enum" NOT NULL DEFAULT 'solid',
        "backgroundImageUrl" varchar,
        "backgroundColor" varchar(16) NOT NULL DEFAULT '#FFFFFF',
        "textColor" varchar(16) NOT NULL DEFAULT '#000000',
        "accentColor" varchar(16) NOT NULL DEFAULT '#6366F1',
        "logoUrl" varchar,
        "layout" jsonb NOT NULL DEFAULT '[]',
        "isActive" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ticket_designs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ticket_designs_eventId" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_designs_eventId" ON "ticket_designs" ("eventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_designs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ticket_designs_backgroundpattern_enum"`);
  }
}
