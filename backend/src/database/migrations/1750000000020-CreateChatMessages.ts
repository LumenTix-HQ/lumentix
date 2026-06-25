import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateChatMessages1750000000020 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'chat_messages',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
        { name: 'eventId', type: 'uuid' },
        { name: 'userId', type: 'varchar' },
        { name: 'username', type: 'varchar' },
        { name: 'message', type: 'text' },
        { name: 'flagged', type: 'boolean', default: false },
        { name: 'createdAt', type: 'timestamptz', default: 'now()' },
      ],
    }), true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('chat_messages');
  }
}
