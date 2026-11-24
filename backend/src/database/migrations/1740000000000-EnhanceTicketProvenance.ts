import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class EnhanceTicketProvenance1740000000000 implements MigrationInterface {
  name = 'EnhanceTicketProvenance1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if transferHistory column already exists
    const table = await queryRunner.getTable('tickets');
    const hasColumn = table?.columns.some((col) => col.name === 'transferHistory');

    if (!hasColumn) {
      await queryRunner.addColumn(
        'tickets',
        new TableColumn({
          name: 'transferHistory',
          type: 'jsonb',
          default: "'[]'",
          isNullable: false,
        }),
      );

      // Add GIN index for efficient JSONB queries
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_tickets_transfer_history" ON "tickets" USING gin("transferHistory");`,
      );
    }

    // Ensure ownerPublicKey column exists for blockchain transfers
    const hasPublicKey = table?.columns.some((col) => col.name === 'ownerPublicKey');
    if (!hasPublicKey) {
      await queryRunner.addColumn(
        'tickets',
        new TableColumn({
          name: 'ownerPublicKey',
          type: 'varchar',
          length: '64',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tickets_transfer_history";`);
    await queryRunner.dropColumn('tickets', 'transferHistory');
  }
}
