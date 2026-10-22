import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventTermsOfService1770500000001 implements MigrationInterface {
  name = 'CreateEventTermsOfService1770500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_terms_of_service" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "termsContent" text NOT NULL,
        "liabilityDisclaimers" text,
        "customAgreements" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_event_terms_of_service_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_event_terms_of_service_eventId" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_event_terms_of_service_eventId" ON "event_terms_of_service" ("eventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "event_terms_of_service"`);
  }
}
