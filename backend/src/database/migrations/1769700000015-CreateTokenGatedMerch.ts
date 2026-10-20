import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTokenGatedMerch1769700000015 implements MigrationInterface {
  name = 'CreateTokenGatedMerch1769700000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "merch_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "name" varchar(128) NOT NULL,
        "description" text,
        "price" numeric(18,7) NOT NULL,
        "currency" varchar(16) NOT NULL DEFAULT 'USD',
        "totalStock" integer NOT NULL,
        "reservedStock" integer NOT NULL DEFAULT 0,
        "isTokenGated" boolean NOT NULL DEFAULT false,
        "gateType" varchar(16),
        "requiredAssetCode" varchar(32),
        "requiredVipTier" varchar(16),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merch_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merch_items_eventId" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "merch_reservations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "merchItemId" uuid NOT NULL,
        "buyerId" varchar NOT NULL,
        "proofId" varchar,
        "status" varchar(16) NOT NULL DEFAULT 'reserved',
        "purchasedAt" TIMESTAMPTZ,
        "reservedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "releasedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_merch_reservations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merch_reservations_merchItemId" FOREIGN KEY ("merchItemId") REFERENCES "merch_items"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merch_items_eventId" ON "merch_items" ("eventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merch_reservations_merchItemId" ON "merch_reservations" ("merchItemId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merch_reservations_buyerId" ON "merch_reservations" ("buyerId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "merch_reservations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merch_items"`);
  }
}
