import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPdfUrlToTickets1743330200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tickets',
      new TableColumn({ name: 'pdfUrl', type: 'varchar', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tickets', 'pdfUrl');
  }
}
