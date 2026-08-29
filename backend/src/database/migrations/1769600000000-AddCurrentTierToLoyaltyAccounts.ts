import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCurrentTierToLoyaltyAccounts1769600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'loyalty_accounts',
      new TableColumn({
        name: 'currentTier',
        type: 'varchar',
        length: '16',
        isNullable: false,
        default: `'Bronze'`,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('loyalty_accounts', 'currentTier');
  }
}
