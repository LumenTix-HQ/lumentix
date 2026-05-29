# Contributing to Lumentix

Thank you for contributing! Please read this guide before opening a pull request.

---

## Database Migration Workflow

**`DB_SYNCHRONIZE` is permanently disabled.** TypeORM's `synchronize: true` must never be used in any environment — it can silently drop columns and cause data loss.

### Rules

1. **Every entity change requires a migration.** If you add, rename, or remove a column, table, or index, you must generate a migration file.
2. **Never commit `DB_SYNCHRONIZE=true`** in any `.env` file or in `app.module.ts`. The pre-commit hook and CI will reject it.
3. **Migrations are run automatically** on deployment via `npm run migration:run`.

### Generating a Migration

After modifying an entity, generate a migration:

```bash
cd backend

# 1. Build the project so TypeORM can diff the compiled entities
npm run build

# 2. Generate a migration (replace MyMigrationName with a descriptive name)
npm run migration:generate -- src/database/migrations/MyMigrationName
```

This creates a timestamped file in `src/database/migrations/`.

### Running Migrations

```bash
cd backend
npm run migration:run
```

### Reverting the Last Migration

```bash
cd backend
npm run migration:revert
```

### Checking Migration Status

```bash
cd backend
npm run migration:show
```

### CI Check

The CI pipeline runs `check-synchronize` on every PR touching `backend/**`. It will fail if:

- `synchronize: true` is found in `app.module.ts`
- `DB_SYNCHRONIZE=true` is found in any committed `.env` file

### Pre-commit Hook

Install the pre-commit hook to catch issues locally before pushing:

```bash
cp backend/scripts/check-synchronize.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

---

## Code Style

- Follow the existing NestJS module structure.
- Run `npm run lint` and `npm run format` before committing.
- Write unit tests for all new services and significant logic changes.

## Pull Requests

- Link all related issues in the PR description using `Closes #<issue-number>`.
- Keep PRs focused — one feature or fix per PR where possible.
- Ensure all CI checks pass before requesting review.
