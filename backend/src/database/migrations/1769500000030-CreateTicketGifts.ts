import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTicketGifts1769500000030 implements MigrationInterface {
  name = 'CreateTicketGifts1769500000030';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ticket_gifts_status_enum" AS ENUM('wrapped', 'scheduled', 'delivered', 'unwrapped', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ticket_gifts_wrapstyle_enum" AS ENUM('classic', 'confetti', 'fireworks', 'envelope', 'birthday')`,
    );
    await queryRunner.query(`
      CREATE TABLE "ticket_gifts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ticketId" character varying(128) NOT NULL,
        "eventId" character varying(128) NOT NULL,
        "senderId" character varying(128) NOT NULL,
        "recipientId" character varying(128) NOT NULL,
        "message" text,
        "wrapStyle" "public"."ticket_gifts_wrapstyle_enum" NOT NULL DEFAULT 'classic',
        "status" "public"."ticket_gifts_status_enum" NOT NULL DEFAULT 'wrapped',
        "scheduledFor" TIMESTAMP WITH TIME ZONE,
        "deliveredAt" TIMESTAMP WITH TIME ZONE,
        "unwrappedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ticket_gifts_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_gifts_ticketId" ON "ticket_gifts" ("ticketId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_gifts_senderId" ON "ticket_gifts" ("senderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_gifts_recipientId" ON "ticket_gifts" ("recipientId")`,
    );
    // The scheduled-delivery sweep queries on exactly this pair.
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_gifts_status_scheduledFor" ON "ticket_gifts" ("status", "scheduledFor")`,
    );
    // A ticket can be gifted repeatedly over its life, but only one gift may
    // be in flight for it at a time.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ticket_gifts_pending_ticket" ON "ticket_gifts" ("ticketId") WHERE "status" IN ('wrapped', 'scheduled')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_ticket_gifts_pending_ticket"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ticket_gifts_status_scheduledFor"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ticket_gifts_recipientId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ticket_gifts_senderId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ticket_gifts_ticketId"`);
    await queryRunner.query(`DROP TABLE "ticket_gifts"`);
    await queryRunner.query(`DROP TYPE "public"."ticket_gifts_wrapstyle_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ticket_gifts_status_enum"`);
  }
}
