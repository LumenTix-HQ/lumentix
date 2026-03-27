import { DataSource } from 'typeorm';

/**
 * Truncate all application tables in the correct order (respecting FK constraints).
 * Uses CASCADE so order matters less, but we still list child tables first for clarity.
 */
export async function clearDatabase(dataSource: DataSource): Promise<void> {
  const tables = [
    'tickets',
    'sponsor_contributions',
    'sponsor_tiers',
    'payments',
    'audit_logs',
    'events',
    'users',
  ];

  // Use a single raw query with CASCADE to avoid FK issues
  for (const table of tables) {
    try {
      await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table may not exist yet — ignore
    }
  }
}
