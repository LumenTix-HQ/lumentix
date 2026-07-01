
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSponsorProfileFieldsToUser1758876900000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'displayName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'logoUrl',
        type: 'varchar',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('users', ['displayName', 'logoUrl']);
  }
}