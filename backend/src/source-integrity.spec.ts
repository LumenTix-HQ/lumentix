/**
 * Static checks over the src/ import graph. Runs as part of `npm test` and as
 * its own CI step so these failures are reported by name instead of being lost
 * among unrelated suite failures.
 *
 * - Every relative / `src/` import must resolve to a file on disk. Catches spec
 *   files left behind after their source was deleted (#1125).
 * - Every `*.module.ts` must be reachable from main.ts. Catches feature modules
 *   that were written but never registered in AppModule, whose routes silently
 *   404 (#1124, #1126).
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = __dirname;
const BACKEND_ROOT = path.resolve(SRC_ROOT, '..');
const ENTRY = path.join(SRC_ROOT, 'main.ts');
const RESOLVE_SUFFIXES = ['', '.ts', '.js', '.json', '/index.ts', '/index.js'];

/**
 * Module files that are knowingly not reachable from main.ts. Each entry needs
 * a reason; prefer wiring the module or deleting it over adding here. The
 * last test fails once an entry becomes reachable, so remove it then.
 */
const UNREGISTERED_MODULE_ALLOWLIST: Record<string, string> = {
  'src/auth/mfa/mfa.module.ts':
    'MFA endpoints exist but login does not enforce MFA yet; wiring needs a product decision',
  'src/common/storage/storage.module.ts': 'helper module with no consumer yet',
  'src/common/upload/upload.module.ts': 'helper module with no consumer yet',
};

/**
 * Imports that were already broken on main when this check was added. They
 * are missing implementations rather than stale paths, so fixing them is
 * tracked separately. Do not add to this list; the last test fails once an
 * entry resolves, so remove it then.
 */
const KNOWN_UNRESOLVED_IMPORTS = new Set<string>([
  "src/auth/auth.controller.ts -> './guards/local-auth.guard'",
  "src/auth/auth.controller.ts -> './dto/verify-email.dto'",
  "src/events/cancel-event.e2e-spec.ts -> '../../src/refunds/refund.service'",
  "src/payments/controllers/payment-analytics.controller.ts -> '../../common/decorators/authenticated-user.decorator'",
  "src/payments/multisig/multisig.controller.ts -> '../../auth/interfaces/authenticated-request.interface'",
  "src/tickets/dynamic-qr/dynamic-qr.controller.ts -> '../../auth/interfaces/authenticated-request.interface'",
]);

const IMPORT_PATTERNS = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bjest\.(?:mock|requireActual|doMock)\(\s*['"]([^'"]+)['"]/g,
];

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [full]
      : [];
  });
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importSpecifiers(file: string): string[] {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  const specs = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) specs.add(match[1]);
  }
  return [...specs];
}

/** Returns the resolved path, null if unresolvable, or undefined for packages. */
function resolveLocal(
  fromFile: string,
  spec: string,
): string | null | undefined {
  let base: string;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else if (spec === 'src' || spec.startsWith('src/'))
    base = path.resolve(BACKEND_ROOT, spec);
  else return undefined;

  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  return null;
}

const rel = (p: string) => path.relative(BACKEND_ROOT, p);
const isSpec = (p: string) => /\.(e2e-)?spec\.ts$/.test(p);

function findUnresolvedImports(files: string[]): string[] {
  const unresolved: string[] = [];
  for (const file of files) {
    for (const spec of importSpecifiers(file)) {
      if (resolveLocal(file, spec) === null)
        unresolved.push(`${rel(file)} -> '${spec}'`);
    }
  }
  return unresolved;
}

function findUnreachableModules(files: string[]): string[] {
  const reachable = new Set<string>();
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const spec of importSpecifiers(file)) {
      const target = resolveLocal(file, spec);
      if (target && target.endsWith('.ts') && !isSpec(target))
        queue.push(target);
    }
  }
  return files
    .filter((f) => f.endsWith('.module.ts') && !reachable.has(f))
    .map(rel);
}

describe('source integrity', () => {
  const files = listTsFiles(SRC_ROOT);
  const unresolved = findUnresolvedImports(files);
  const unreachable = findUnreachableModules(files);

  it('every local import resolves to an existing file', () => {
    expect(
      unresolved.filter((entry) => !KNOWN_UNRESOLVED_IMPORTS.has(entry)),
    ).toEqual([]);
  });

  it('every *.module.ts is reachable from main.ts', () => {
    expect(
      unreachable.filter((f) => !(f in UNREGISTERED_MODULE_ALLOWLIST)),
    ).toEqual([]);
  });

  it('allowlists only contain entries that are still broken', () => {
    expect(
      [...KNOWN_UNRESOLVED_IMPORTS].filter((e) => !unresolved.includes(e)),
    ).toEqual([]);
    expect(
      Object.keys(UNREGISTERED_MODULE_ALLOWLIST).filter(
        (f) => !unreachable.includes(f),
      ),
    ).toEqual([]);
  });
});
