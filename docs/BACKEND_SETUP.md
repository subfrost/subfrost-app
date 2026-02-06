# Backend Infrastructure Setup

This document describes the database (Cloud SQL PostgreSQL) and cache (Memorystore Redis) infrastructure for the Subfrost App.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Google Cloud                              │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  Cloud Run   │───▶│  VPC Connector   │───▶│   Private    │  │
│  │ subfrost-app │    │ subfrost-connector│    │   Network    │  │
│  └──────────────┘    └──────────────────┘    │  10.8.0.0/28 │  │
│                                               └──────┬───────┘  │
│                                                      │          │
│                      ┌───────────────────────────────┼─────┐    │
│                      │                               │     │    │
│               ┌──────▼──────┐              ┌────────▼────┐│    │
│               │  Cloud SQL  │              │ Memorystore ││    │
│               │  PostgreSQL │              │    Redis    ││    │
│               │ 10.11.192.3 │              │ 10.11.193.4 ││    │
│               └─────────────┘              └─────────────┘│    │
│                      │                                    │    │
│                      └──────────────VPC Peering───────────┘    │
│                               (subfrost-vpc-range)              │
└─────────────────────────────────────────────────────────────────┘
```

## Infrastructure Details

### Cloud SQL (PostgreSQL 15)

- **Instance**: `subfrost-db`
- **Region**: `us-central1`
- **Tier**: `db-g1-small` (1 vCPU, 1.7 GB RAM)
- **Private IP**: `10.11.192.3`
- **Database**: `subfrost`
- **User**: `subfrost_app`

### Memorystore (Redis 7.0)

- **Instance**: `subfrost-cache`
- **Region**: `us-central1`
- **Size**: 2 GB
- **Tier**: Standard (HA with replica)
- **Private IP**: `10.11.193.4`
- **Port**: `6379`

### VPC Access Connector

- **Name**: `subfrost-connector`
- **IP Range**: `10.8.0.0/28`
- **Machine Type**: `e2-micro`
- **Min/Max Instances**: 2/3

## Local Development Setup

### Option 1: Docker Compose (Recommended)

Create a `docker-compose.yml` in the project root:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: subfrost
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

Start the services:

```bash
docker-compose up -d
```

### Option 2: Cloud SQL Proxy (Direct Cloud Connection)

```bash
# Install the proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Run the proxy (requires gcloud auth)
./cloud-sql-proxy lithomantic-heaven-bestary:us-central1:subfrost-db
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# For local Docker setup
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/subfrost"
REDIS_HOST=localhost
REDIS_PORT=6379

# For Cloud Run (set via GitHub secrets or Cloud Run env vars)
DATABASE_URL="postgresql://subfrost_app:PASSWORD@10.11.192.3:5432/subfrost"
REDIS_HOST=10.11.193.4
REDIS_PORT=6379
```

## GitHub Secrets

The following secrets should be configured in GitHub for CI/CD:

| Secret Name | Description |
|------------|-------------|
| `DATABASE_URL` | Full PostgreSQL connection string |
| `REDIS_HOST` | Redis private IP (10.11.193.4) |
| `REDIS_PORT` | Redis port (6379) |

To set secrets via GitHub CLI:

```bash
gh secret set DATABASE_URL -b "postgresql://subfrost_app:PASSWORD@10.11.192.3:5432/subfrost"
gh secret set REDIS_HOST -b "10.11.193.4"
gh secret set REDIS_PORT -b "6379"
```

## Database Migrations

### Development

```bash
# Create a new migration
pnpm db:migrate:dev --name add_new_feature

# Apply migrations
pnpm db:push

# Open Prisma Studio (GUI)
pnpm db:studio
```

### Production

Migrations are applied automatically during the build process via `prisma migrate deploy`.

## Usage Examples

### Importing Database Clients

```typescript
import { prisma, cache, redis } from '@/lib/db';

// Or import individually
import { prisma } from '@/lib/db/prisma';
import { redis, cache } from '@/lib/db/redis';
```

### Cache-First Pattern

```typescript
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

async function getPoolData(poolId: string) {
  const cacheKey = `pool:${poolId}`;

  // Try cache first
  const cached = await cache.get<PoolData>(cacheKey);
  if (cached) return cached;

  // Fetch from database
  const data = await prisma.poolMetadata.findUnique({
    where: { poolId }
  });

  // Cache for 5 minutes
  if (data) {
    await cache.set(cacheKey, data, 300);
  }

  return data;
}
```

### Using getOrSet (Cleaner Pattern)

```typescript
import { cache } from '@/lib/db/redis';
import { prisma } from '@/lib/db/prisma';

async function getTokenMetadata(tokenId: string) {
  return cache.getOrSet(
    `token:${tokenId}`,
    () => prisma.tokenMetadata.findUnique({ where: { tokenId } }),
    300 // 5 minute TTL
  );
}
```

### Write with Cache Invalidation

```typescript
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

async function updatePoolStats(poolId: string, stats: PoolStats) {
  // Update database
  await prisma.poolMetadata.update({
    where: { poolId },
    data: stats
  });

  // Invalidate cache
  await cache.del(`pool:${poolId}`);
  await cache.del(`pools:list:*`); // Invalidate list caches
}
```

## Health Check

The `/api/health` endpoint reports database and cache connectivity:

```bash
curl https://subfrost.io/api/health
```

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "services": {
    "database": { "status": "connected", "latencyMs": 5 },
    "cache": { "status": "connected", "latencyMs": 2 }
  }
}
```

## Troubleshooting

### "Connection refused" errors

1. Ensure VPC connector is attached to Cloud Run service
2. Verify private IPs are correct
3. Check firewall rules allow internal traffic

### "Too many connections" errors

1. Check Prisma connection pool settings
2. Ensure singleton pattern is used (see `lib/db/prisma.ts`)
3. Consider increasing Cloud SQL instance tier

### Redis timeout errors

1. Check Memorystore instance status in GCP Console
2. Verify VPC peering is active
3. Check for memory pressure (scale up if needed)

## Updating Cloud Run Service

To connect Cloud Run to the VPC (if not already done):

```bash
gcloud run services update subfrost-app \
  --region=us-central1 \
  --vpc-connector=subfrost-connector \
  --vpc-egress=private-ranges-only
```
