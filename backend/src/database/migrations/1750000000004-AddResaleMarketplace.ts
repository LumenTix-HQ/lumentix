import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddResaleMarketplace1750000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tickets',
      new TableColumn({
        name: 'listedAt',
        type: 'timestamptz',
        isNullable: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'resale_transactions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'ticketId', type: 'varchar' },
          { name: 'eventId', type: 'varchar' },
          { name: 'sellerId', type: 'varchar' },
          { name: 'buyerId', type: 'varchar' },
          { name: 'salePrice', type: 'decimal', precision: 18, scale: 7 },
          { name: 'currency', type: 'varchar', default: "'XLM'" },
          { name: 'originalPrice', type: 'decimal', precision: 18, scale: 7 },
          { name: 'organizerFee', type: 'decimal', precision: 18, scale: 7 },
          { name: 'sellerPayout', type: 'decimal', precision: 18, scale: 7 },
          { name: 'status', type: 'varchar', default: "'completed'" },
          { name: 'transactionHash', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
        indices: [
          { columnNames: ['ticketId'] },
          { columnNames: ['sellerId'] },
          { columnNames: ['buyerId'] },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resale_transactions');
    await queryRunner.dropColumn('tickets', 'listedAt');
  }
}
