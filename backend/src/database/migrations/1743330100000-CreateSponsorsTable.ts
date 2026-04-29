import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateSponsorsTable1743330100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sponsors',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'eventId', type: 'uuid', isNullable: false },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'amount', type: 'decimal', precision: 18, scale: 7, isNullable: false },
          { name: 'tierId', type: 'uuid', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('sponsors', new TableIndex({ name: 'IDX_sponsors_eventId', columnNames: ['eventId'] }));
    await queryRunner.createIndex('sponsors', new TableIndex({ name: 'IDX_sponsors_userId', columnNames: ['userId'] }));

    await queryRunner.createForeignKey('sponsors', new TableForeignKey({ columnNames: ['eventId'], referencedTableName: 'events', referencedColumnNames: ['id'], onDelete: 'CASCADE' }));
    await queryRunner.createForeignKey('sponsors', new TableForeignKey({ columnNames: ['userId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }));
    await queryRunner.createForeignKey('sponsors', new TableForeignKey({ columnNames: ['tierId'], referencedTableName: 'sponsor_tiers', referencedColumnNames: ['id'], onDelete: 'SET NULL' }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sponsors');
  }
}
