import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface LoadedMigration {
  file: string;
  fileTimestamp: string;
  className: string;
  migrationName: string;
}

function loadMigrations(): LoadedMigration[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{13}-.+\.ts$/.test(file))
    .sort()
    .map((file) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const exported = require(path.join(MIGRATIONS_DIR, file)) as Record<string, new () => { name?: string }>;
      const Migration = Object.values(exported).find((value) => typeof value === 'function');
      if (!Migration) throw new Error(`${file} does not export a migration class`);
      return {
        file,
        fileTimestamp: file.slice(0, 13),
        className: Migration.name,
        migrationName: new Migration().name ?? Migration.name,
      };
    });
}

describe('database migrations', () => {
  const migrations = loadMigrations();

  it('loads at least one migration', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it('uses a unique timestamp for every migration', () => {
    const timestamps = migrations.map((m) => m.migrationName.slice(-13));
    const duplicates = timestamps.filter((t, i) => timestamps.indexOf(t) !== i);
    expect(duplicates).toEqual([]);
  });

  it('uses a unique file timestamp prefix for every migration', () => {
    const prefixes = migrations.map((m) => m.fileTimestamp);
    const duplicates = prefixes.filter((t, i) => prefixes.indexOf(t) !== i);
    expect(duplicates).toEqual([]);
  });

  it.each(migrations.map((m) => [m.file, m] as const))(
    '%s has a class timestamp that matches its filename',
    (_file, migration) => {
      expect(migration.migrationName.slice(-13)).toBe(migration.fileTimestamp);
      expect(migration.className.slice(-13)).toBe(migration.fileTimestamp);
    },
  );
});
