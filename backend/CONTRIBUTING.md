# Contributing to LumenTix Backend

## Database Migrations Policy
- `DB_SYNCHRONIZE` is strictly disabled across all environments (development, staging, production).
- Every change to a TypeORM entity MUST be accompanied by an explicit database migration file.
- Continuous Integration will enforce migration checks via `npm run check-migrations`.
