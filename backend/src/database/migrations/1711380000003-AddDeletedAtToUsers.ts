import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToUsers1711380000003 implements MigrationInterface {
  name = 'AddDeletedAtToUsers1711380000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
  }
}
