import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageUrlToEvents1743330500000 implements MigrationInterface {
  name = 'AddImageUrlToEvents1743330500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "imageUrl" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "imageUrl"`,
    );
  }
}
