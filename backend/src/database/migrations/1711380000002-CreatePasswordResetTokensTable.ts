import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetTokensTable1711380000002 implements MigrationInterface {
  name = 'CreatePasswordResetTokensTable1711380000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "password_reset_tokens" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "tokenHash" character varying NOT NULL,
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "used" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_password_reset_tokens_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_password_reset_tokens_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_password_reset_tokens_userId"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
