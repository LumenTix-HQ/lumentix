import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddAgeVerification1750000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'age_verifications',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'userId', type: 'varchar' },
          { name: 'eventId', type: 'varchar' },
          { name: 'dateOfBirth', type: 'date', isNullable: true },
          { name: 'ageRestriction', type: 'enum', enum: ['none', '18+', '21+'], default: "'none'" },
          { name: 'verificationMethod', type: 'enum', enum: ['manual', 'identity_service', 'blockchain', 'third_party'], default: "'manual'" },
          { name: 'status', type: 'varchar', default: "'pending'" },
          { name: 'identityVerificationId', type: 'varchar', isNullable: true },
          { name: 'verificationMetadata', type: 'jsonb', isNullable: true },
          { name: 'verifiedAt', type: 'timestamptz', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
        indices: [
          { columnNames: ['userId', 'status'] },
          { columnNames: ['eventId', 'userId'] },
        ],
      }),
      true,
    );

    await queryRunner.addColumn(
      'events',
      new TableColumn({
        name: 'ageRestriction',
        type: 'enum',
        enum: ['none', '18+', '21+'],
        default: "'none'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('age_verifications');
    await queryRunner.dropColumn('events', 'ageRestriction');
  }
}
