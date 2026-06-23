# Contributing to Lumentix

Thank you for contributing to Lumentix! Please read these guidelines before opening a pull request.

## Database Migrations

Lumentix uses **TypeORM migrations exclusively** for all schema changes. `DB_SYNCHRONIZE` must never be enabled in any environment other than local development sandboxes, and even then it is strongly discouraged.

### Creating a migration

Whenever you change a TypeORM entity (add/remove/rename a column, change a type, add an index, etc.) you **must** generate a migration:

```bash
cd backend
npm run migration:generate -- -n DescriptiveMigrationName
```

This creates a timestamped file under `src/database/migrations/`. Review the generated SQL before committing.

### Running migrations

```bash
# Apply all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

### Checking for pending migrations (CI)

The CI pipeline runs `npm run check-migrations` after the build step to ensure no entity change was left without a corresponding migration. If this check fails your PR will not merge.

```bash
npm run check-migrations
```

### Never use DB_SYNCHRONIZE=true in production

Setting `DB_SYNCHRONIZE=true` lets TypeORM alter the database schema automatically at startup. This is **dangerous in production** because:

- It can silently drop columns or tables.
- It bypasses the reviewed migration history.
- It makes rollbacks impossible.

Always use `npm run migration:generate` for entity changes and commit the resulting migration file to the repository.

## Code Style

- Follow the existing NestJS module/service/controller structure.
- Run `npm run lint` before pushing.
- Run `npm test` to verify nothing is broken.

## Pull Requests

- Reference the GitHub issue number in the PR title or description (`Closes #NNN`).
- Keep PRs focused — one feature or fix per PR.
- Add or update tests for every changed behaviour.
