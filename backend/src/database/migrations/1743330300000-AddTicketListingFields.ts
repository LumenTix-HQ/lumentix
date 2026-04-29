import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTicketListingFields1743330300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('tickets', [
      new TableColumn({ name: 'listingPrice', type: 'decimal', precision: 18, scale: 7, isNullable: true }),
      new TableColumn({ name: 'isListed', type: 'boolean', default: false }),
      new TableColumn({ name: 'listingCurrency', type: 'varchar', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tickets', 'listingPrice');
    await queryRunner.dropColumn('tickets', 'isListed');
    await queryRunner.dropColumn('tickets', 'listingCurrency');
  }
}
