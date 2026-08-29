import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmailCampaigns1769700000040 implements MigrationInterface {
  name = 'CreateEmailCampaigns1769700000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organizerId" uuid NOT NULL,
        "eventId" uuid,
        "name" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        "winningVariantId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_campaigns_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_campaign_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaignId" uuid NOT NULL,
        "label" varchar(64) NOT NULL,
        "subject" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "sentCount" integer NOT NULL DEFAULT 0,
        "openCount" integer NOT NULL DEFAULT 0,
        "clickCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_campaign_variants_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_campaign_variants_campaignId" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_campaign_recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaignId" uuid NOT NULL,
        "variantId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "sentAt" TIMESTAMP NOT NULL DEFAULT now(),
        "openedAt" TIMESTAMPTZ,
        "clickedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_email_campaign_recipients_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_campaign_recipients_variantId" FOREIGN KEY ("variantId") REFERENCES "email_campaign_variants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_campaign_variants_campaignId" ON "email_campaign_variants" ("campaignId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_campaign_recipients_campaignId" ON "email_campaign_recipients" ("campaignId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_campaign_recipients_variantId" ON "email_campaign_recipients" ("variantId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_campaign_recipients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_campaign_variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_campaigns"`);
  }
}
