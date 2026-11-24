import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression guard for #1381.
 *
 * `@Roles(...)` is inert metadata: it does nothing unless a `RolesGuard` is
 * actually applied to the route (or globally). Four controllers shipped with
 * `@Roles(...)` but no `RolesGuard`, which let any authenticated user reach
 * "admin-only" endpoints — including `POST /users`, which could create a
 * brand-new admin account.
 *
 * This walks every controller that uses `@Roles(...)` and asserts the file
 * also references `RolesGuard`, so a future controller cannot silently regress.
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

describe('@Roles() guard coverage', () => {
  const controllers = listFiles(SRC_ROOT).filter((file) =>
    fs.readFileSync(file, 'utf8').includes('@Roles('),
  );

  it('finds controllers that declare @Roles()', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  it.each(controllers)(
    '%s applies RolesGuard alongside its @Roles() usage',
    (file) => {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).toContain('RolesGuard');
    },
  );
});
