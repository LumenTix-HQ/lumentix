# Contributing to LumenTix Backend

## Database Schema Changes

**Always generate a migration for every entity change.** TypeORM `synchronize` is
disabled in all environments to keep schema changes tracked in version control.

### Workflow

1. Edit your entity file.
2. Generate a migration:
   ```bash
   npm run migration:generate -- src/database/migrations/DescriptiveName
   ```
3. Review the generated migration file before committing.
4. Run migrations locally to verify:
   ```bash
   npm run migration:run
   ```
5. Commit both the entity change and the migration together.

### Why `synchronize: false`?

Setting `synchronize: true` in development silently modifies the database schema
without creating a migration record. This makes schema changes invisible in
migration history and impossible to roll back cleanly. All schema changes must
be tracked via migrations.

### Checking for pending migrations

```bash
npm run check-migrations
```

This exits non-zero if any unapplied migrations exist.
