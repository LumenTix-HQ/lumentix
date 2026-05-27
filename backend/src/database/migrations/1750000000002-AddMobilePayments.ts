import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddMobilePayments1750000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mobile_payments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'userId', type: 'varchar' },
          { name: 'eventId', type: 'varchar' },
          { name: 'paymentIntentId', type: 'varchar', isNullable: true },
          { name: 'walletType', type: 'enum', enum: ['apple_pay', 'google_pay', 'samsung_pay'] },
          { name: 'status', type: 'enum', enum: ['initiated', 'authorized', 'completed', 'failed', 'refunded'], default: "'initiated'" },
          { name: 'amount', type: 'decimal', precision: 18, scale: 7 },
          { name: 'currency', type: 'varchar', default: "'XLM'" },
          { name: 'walletToken', type: 'text', isNullable: true },
          { name: 'transactionHash', type: 'text', isNullable: true },
          { name: 'gatewayReference', type: 'varchar', isNullable: true },
          { name: 'gatewayResponse', type: 'jsonb', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
        indices: [
          { columnNames: ['userId', 'status'] },
          { columnNames: ['walletType', 'status'] },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mobile_payments');
  }
}
