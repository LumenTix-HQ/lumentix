#!/bin/sh
# Pre-commit hook: block committing DB_SYNCHRONIZE=true in any .env file
# Install: cp .git/hooks/pre-commit.sample .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# Or use Husky: npx husky add .husky/pre-commit "sh scripts/check-env.sh"

set -e

STAGED_ENV_FILES=$(git diff --cached --name-only | grep -E '\.env' || true)

if [ -n "$STAGED_ENV_FILES" ]; then
  for file in $STAGED_ENV_FILES; do
    if grep -q "DB_SYNCHRONIZE=true" "$file" 2>/dev/null; then
      echo "❌ ERROR: DB_SYNCHRONIZE=true found in $file"
      echo "   Use migrations instead. Set DB_SYNCHRONIZE=false or remove the variable."
      exit 1
    fi
  done
fi

# Also check app.module.ts for accidental synchronize: true
if git diff --cached --name-only | grep -q "app.module.ts"; then
  if git show :backend/src/app.module.ts 2>/dev/null | grep -q "synchronize: true"; then
    echo "❌ ERROR: synchronize: true found in app.module.ts"
    echo "   Use migrations instead."
    exit 1
  fi
fi

exit 0
