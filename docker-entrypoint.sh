#!/bin/sh
set -e
echo "Running database migrations..."

# Capture both stdout and stderr
if prisma migrate deploy --schema=./prisma/schema.prisma > /tmp/migrate.log 2>&1; then
  cat /tmp/migrate.log
  echo "Migrations applied successfully."
else
  cat /tmp/migrate.log
  # Check if the baseline migration failed because tables already exist (from db:push)
  if grep -q "P3005\|P3009\|already exists\|relation.*already exists" /tmp/migrate.log; then
    echo "Baseline tables already exist, marking baseline migration as applied..."
    prisma migrate resolve --applied 20260205000000_baseline --schema=./prisma/schema.prisma || true
    # Retry to apply any subsequent migrations (e.g., add_invite_code_hierarchy)
    prisma migrate deploy --schema=./prisma/schema.prisma || echo "Migration deploy retry completed with warnings"
  else
    echo "Migration failed, continuing anyway..."
  fi
fi

echo "Starting application..."
exec node server.js
