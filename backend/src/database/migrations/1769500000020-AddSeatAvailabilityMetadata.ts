import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeatAvailabilityMetadata1769500000020 implements MigrationInterface {
  name = 'AddSeatAvailabilityMetadata1769500000020';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "seats" ADD "price" numeric(18,7) NOT NULL DEFAULT 0');
    await queryRunner.query('ALTER TABLE "seats" ADD "pricingTier" character varying(32) NOT NULL DEFAULT \'General\'');
    await queryRunner.query('ALTER TABLE "seats" ADD "obstructedView" boolean NOT NULL DEFAULT false');
    await queryRunner.query('ALTER TABLE "seats" ADD "holdExpiresAt" TIMESTAMP WITH TIME ZONE');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "seats" DROP COLUMN "holdExpiresAt"');
    await queryRunner.query('ALTER TABLE "seats" DROP COLUMN "obstructedView"');
    await queryRunner.query('ALTER TABLE "seats" DROP COLUMN "pricingTier"');
    await queryRunner.query('ALTER TABLE "seats" DROP COLUMN "price"');
  }
}