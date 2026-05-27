import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddRecommendations1750000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_preferences',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'userId', type: 'varchar' },
          { name: 'category', type: 'varchar', isNullable: true },
          { name: 'location', type: 'varchar', isNullable: true },
          { name: 'weight', type: 'int', default: 0 },
          { name: 'attendanceCount', type: 'int', default: 0 },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
        indices: [
          { columnNames: ['userId', 'category'] },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'event_similarities',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'eventId', type: 'varchar' },
          { name: 'similarEventId', type: 'varchar' },
          { name: 'similarityScore', type: 'decimal', precision: 5, scale: 4, default: 0 },
          { name: 'sharedAttributes', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
        indices: [
          { columnNames: ['eventId', 'similarEventId'] },
          { columnNames: ['similarityScore'] },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('event_similarities');
    await queryRunner.dropTable('user_preferences');
  }
}
