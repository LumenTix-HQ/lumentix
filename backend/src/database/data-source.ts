import { DataSource } from 'typeorm';
import * as path from 'path';

/**
 * Standalone DataSource used by the TypeORM CLI for migration generation,
 * running, and reverting. Not used at runtime (app uses TypeOrmModule).
 *
 * Usage:
 *   npm run migration:generate -- src/database/migrations/MyMigration
 *   npm run migration:run
 *   npm run migration:revert
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'lumentix_db',
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: false,
});
