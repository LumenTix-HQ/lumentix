import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddFraudFlags1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'fraud_flags',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'ticketId', type: 'varchar' },
          { name: 'eventId', type: 'varchar' },
          { name: 'buyerId', type: 'varchar' },
          { name: 'sellerId', type: 'varchar' },
          { name: 'price', type: 'decimal', precision: 18, scale: 7 },
          { name: 'riskScore', type: 'int' },
          { name: 'riskLevel', type: 'varchar' },
          { name: 'reasons', type: 'text' },
          { name: 'onHold', type: 'boolean', default: false },
          { name: 'resolved', type: 'boolean', default: false },
          { name: 'reviewedBy', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
        indices: [
          { columnNames: ['ticketId'] },
          { columnNames: ['buyerId'] },
          { columnNames: ['sellerId'] },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('fraud_flags');
  }
}
