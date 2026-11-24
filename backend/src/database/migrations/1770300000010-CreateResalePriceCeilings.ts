import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResalePriceCeilings1770300000010 implements MigrationInterface {
  name = 'CreateResalePriceCeilings1770300000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "resale_price_ceilings" (
        "eventId" character varying(128) NOT NULL,
        "ceilingMultiplierBps" integer NOT NULL,
        "absoluteCeiling" numeric(18,7) NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resale_price_ceilings_eventId" PRIMARY KEY ("eventId")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "resale_price_ceilings"`);
  }
}
