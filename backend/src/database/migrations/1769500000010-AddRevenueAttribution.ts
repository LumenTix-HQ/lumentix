import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRevenueAttribution1769500000010 implements MigrationInterface {
  name = 'AddRevenueAttribution1769500000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "payments" ADD "ticketTier" character varying(128)');
    await queryRunner.query('ALTER TABLE "payments" ADD "promoCode" character varying(64)');
    await queryRunner.query('ALTER TABLE "payments" ADD "productType" character varying(32) NOT NULL DEFAULT \'ticket\'');
    await queryRunner.query('ALTER TABLE "merch_reservations" ADD "purchasedAt" TIMESTAMP WITH TIME ZONE');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "merch_reservations" DROP COLUMN "purchasedAt"');
    await queryRunner.query('ALTER TABLE "payments" DROP COLUMN "productType"');
    await queryRunner.query('ALTER TABLE "payments" DROP COLUMN "promoCode"');
    await queryRunner.query('ALTER TABLE "payments" DROP COLUMN "ticketTier"');
  }
}