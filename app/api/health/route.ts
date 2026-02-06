/**
 * Health check API endpoint
 *
 * GET /api/health
 *
 * Returns the health status of the application, including:
 * - Database connectivity (Prisma/PostgreSQL)
 * - Cache connectivity (Redis)
 *
 * @example Response
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-01-15T12:00:00.000Z",
 *   "services": {
 *     "database": { "status": "connected", "latencyMs": 5 },
 *     "cache": { "status": "connected", "latencyMs": 2 }
 *   }
 * }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { redis } from '@/lib/db/redis';

interface ServiceHealth {
  status: 'connected' | 'disconnected' | 'error';
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: ServiceHealth;
    cache: ServiceHealth;
  };
}

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'connected',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkCache(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await redis.ping();
    return {
      status: 'connected',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function GET() {
  const [database, cache] = await Promise.all([checkDatabase(), checkCache()]);

  const allHealthy = database.status === 'connected' && cache.status === 'connected';
  const allDown = database.status !== 'connected' && cache.status !== 'connected';

  const response: HealthResponse = {
    status: allHealthy ? 'healthy' : allDown ? 'unhealthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database,
      cache,
    },
  };

  return NextResponse.json(response, {
    status: allHealthy ? 200 : allDown ? 503 : 200,
  });
}
