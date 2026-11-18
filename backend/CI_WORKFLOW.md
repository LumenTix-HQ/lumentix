# Backend GitHub Actions CI

There is a single backend workflow: **`.github/workflows/backend.yml`**. The old
`ci.yml`/`backend.yml` split was merged in #1610, so there is no
`backend-ci.yml` and lint no longer runs twice.

It runs on:

- pushes to `main` and `develop` that touch `backend/**` (or the workflow file)
- pull requests targeting `main` that touch `backend/**`

All jobs use Node.js 22 with `actions/setup-node`'s npm cache keyed on
`backend/package-lock.json`.

## Jobs

| Job | What it runs | Notes |
| --- | --- | --- |
| `lint` | `npm run lint` | |
| `typecheck` | `npx tsc --noEmit` | |
| `build` | `npm ci`, lockfile sync check, `depcheck`, `npm run build` | Fails on a stale lockfile or an import that is not declared in `package.json`. |
| `test` | `npm run test -- --coverage` | Uploads `backend/coverage/` as the `coverage-report` artifact. |
| `source-integrity` | `npm run test:integrity` | Fails on unresolved imports and modules missing from `AppModule`. |
| `check-migrations` | `npm run check-migrations` | Runs against a `postgres:16` service; fails when an entity change has no migration. |
| `e2e` | `npm run test:e2e` | Needs `lint` and `typecheck`; uses Postgres 16 and Redis 7 service containers. |
| `security-audit` | `npm audit --audit-level=high` | |

## Coverage threshold

`backend/package.json` sets the global coverage threshold to **50%** for
branches, functions, lines and statements. The `test` job fails when coverage
drops below that; there is no separate 80% gate.

## Required checks

The jobs above are the backend checks to require on a PR. Frontend checks live
in `.github/workflows/frontend-ci.yml` and do not run for backend-only changes.
