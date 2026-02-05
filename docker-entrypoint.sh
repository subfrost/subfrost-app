#!/bin/sh
set -e
echo "Running database migrations..."
if ! prisma migrate deploy --schema=./prisma/schema.prisma 2>/tmp/migrate.log; then
  cat /tmp/migrate.log
  if grep -q "P3009\|already exists" /tmp/migrate.log; then
    echo "Baseline tables already exist, marking baseline migration as applied..."
    prisma migrate resolve --applied 20260205000000_baseline --schema=./prisma/schema.prisma || true
    prisma migrate deploy --schema=./prisma/schema.prisma || echo "Migration deploy retry skipped"
  else
    echo "Migration failed (non-baseline error), continuing anyway..."
  fi
fi
echo "Starting application..."
exec node server.js
