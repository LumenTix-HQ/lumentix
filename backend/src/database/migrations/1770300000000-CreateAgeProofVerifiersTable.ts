import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persists age-proof verifiers.
 *
 * `AgeProofService.registerVerifier` previously stored verifiers in an
 * in-memory `Map`, so registrations were lost on restart and not shared across
 * instances. This table makes the trusted verifier set durable and auditable.
 */
export class CreateAgeProofVerifiersTable1770300000000
  implements MigrationInterface
{
  name = 'CreateAgeProofVerifiersTable1770300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "age_proof_verifiers" (
        "id"            uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "verifierId"    varchar     NOT NULL,
        "name"          varchar     NOT NULL,
        "registeredBy"  uuid        DEFAULT NULL,
        "registeredAt"  TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_age_proof_verifiers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_age_proof_verifiers_verifierId" UNIQUE ("verifierId"),
        CONSTRAINT "FK_age_proof_verifiers_registeredBy"
          FOREIGN KEY ("registeredBy") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "age_proof_verifiers"`);
  }
}
