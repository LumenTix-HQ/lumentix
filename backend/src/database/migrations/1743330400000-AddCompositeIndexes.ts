import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddCompositeIndexes1743330400000 implements MigrationInterface {
  name = 'AddCompositeIndexes1743330400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payments: userId + status (for history queries)
    await queryRunner.createIndex(
      'payments',
      new TableIndex({
        name: 'IDX_payments_userId_status',
        columnNames: ['userId', 'status'],
      }),
    );

    // tickets: eventId + status (for capacity queries)
    await queryRunner.createIndex(
      'tickets',
      new TableIndex({
        name: 'IDX_tickets_eventId_status',
        columnNames: ['eventId', 'status'],
      }),
    );

    // registrations: eventId + status (for waitlist queries)
    await queryRunner.createIndex(
      'registrations',
      new TableIndex({
        name: 'IDX_registrations_eventId_status',
        columnNames: ['eventId', 'status'],
      }),
    );

    // audit_logs: userId + action (for filtered audit queries)
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_userId_action',
        columnNames: ['userId', 'action'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_userId_action');
    await queryRunner.dropIndex('registrations', 'IDX_registrations_eventId_status');
    await queryRunner.dropIndex('tickets', 'IDX_tickets_eventId_status');
    await queryRunner.dropIndex('payments', 'IDX_payments_userId_status');
  }
}
