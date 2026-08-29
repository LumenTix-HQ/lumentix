import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUpgradeAuctions1769700000010 implements MigrationInterface {
  name = 'CreateUpgradeAuctions1769700000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "upgrade_auctions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "seatTier" varchar(128) NOT NULL,
        "slotsAvailable" integer NOT NULL,
        "slotsAwarded" integer NOT NULL DEFAULT 0,
        "startingPrice" numeric(18,7) NOT NULL,
        "minIncrement" numeric(18,7) NOT NULL,
        "currency" varchar(16) NOT NULL DEFAULT 'USD',
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "opensAt" TIMESTAMPTZ,
        "closesAt" TIMESTAMPTZ NOT NULL,
        "finalizedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_upgrade_auctions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_upgrade_auctions_eventId" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "upgrade_bids" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "auctionId" uuid NOT NULL,
        "ticketId" uuid NOT NULL,
        "bidderId" uuid NOT NULL,
        "amount" numeric(18,7) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "placedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_upgrade_bids_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_upgrade_bids_auctionId" FOREIGN KEY ("auctionId") REFERENCES "upgrade_auctions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_upgrade_auctions_eventId" ON "upgrade_auctions" ("eventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_upgrade_bids_auctionId_status" ON "upgrade_bids" ("auctionId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_upgrade_bids_ticketId" ON "upgrade_bids" ("ticketId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "upgrade_bids"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "upgrade_auctions"`);
  }
}
