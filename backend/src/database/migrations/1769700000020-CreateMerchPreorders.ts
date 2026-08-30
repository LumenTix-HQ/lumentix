import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchPreorders1769700000020 implements MigrationInterface {
  name = 'CreateMerchPreorders1769700000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "merch_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "merchItemId" uuid NOT NULL,
        "size" varchar(32),
        "color" varchar(32),
        "stockTotal" integer NOT NULL,
        "stockReserved" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merch_variants_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merch_variants_merchItemId" FOREIGN KEY ("merchItemId") REFERENCES "merch_items"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "merch_preorders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "variantId" uuid NOT NULL,
        "ticketId" uuid NOT NULL,
        "buyerId" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "status" varchar(16) NOT NULL DEFAULT 'reserved',
        "reservedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "pickedUpAt" TIMESTAMPTZ,
        CONSTRAINT "PK_merch_preorders_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merch_preorders_variantId" FOREIGN KEY ("variantId") REFERENCES "merch_variants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merch_variants_merchItemId" ON "merch_variants" ("merchItemId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merch_preorders_variantId" ON "merch_preorders" ("variantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merch_preorders_buyerId" ON "merch_preorders" ("buyerId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "merch_preorders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merch_variants"`);
  }
}
