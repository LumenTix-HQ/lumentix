import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFundingGoalToEvents1743330000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'events',
      new TableColumn({
        name: 'fundingGoal',
        type: 'decimal',
        precision: 18,
        scale: 7,
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('events', 'fundingGoal');
  }
}
