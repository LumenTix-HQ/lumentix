import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultisigPayouts1750000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "multisig_payouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" varchar(128) NOT NULL,
        "organizerWallet" varchar(56) NOT NULL,
        "amount" decimal(18,7) NOT NULL,
        "currency" varchar(10) NOT NULL DEFAULT 'XLM',
        "requiredSignatures" int NOT NULL DEFAULT 2,
        "signatures" jsonb NOT NULL DEFAULT '{}',
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "transactionHash" varchar(128),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_multisig_payouts_eventId_status" ON "multisig_payouts" ("eventId", "status")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_multisig_payouts_status" ON "multisig_payouts" ("status")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "multisig_payouts"`);
  }
}
