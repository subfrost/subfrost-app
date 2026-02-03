/**
 * Example API Route - Database & Cache Usage
 *
 * This file demonstrates how to use Prisma and Redis in API routes.
 * New developers can use this as a reference for implementing backend features.
 *
 * GET /api/example
 *   - Demonstrates cache-first pattern with database fallback
 *   - Shows proper error handling and response formatting
 *
 * POST /api/example
 *   - Demonstrates database write with cache invalidation
 *   - Shows input validation pattern
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cache, redis } from '@/lib/db/redis';

// Cache configuration
const CACHE_KEY = 'example:data';
const CACHE_TTL = 300; // 5 minutes

/**
 * GET handler - Cache-first pattern
 *
 * 1. Check Redis cache for existing data
 * 2. If cached, return immediately (fast path)
 * 3. If not cached, fetch from PostgreSQL
 * 4. Cache the result for future requests
 * 5. Return the data
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const skipCache = searchParams.get('skipCache') === 'true';

    // Step 1: Try cache first (unless explicitly skipping)
    if (!skipCache) {
      const cachedData = await cache.get<{ count: number; lastUpdated: string }>(CACHE_KEY);
      if (cachedData) {
        return NextResponse.json({
          success: true,
          data: cachedData,
          source: 'cache',
        });
      }
    }

    // Step 2: Fetch from database
    const tokenCount = await prisma.tokenMetadata.count();
    const poolCount = await prisma.poolMetadata.count();
    const userCount = await prisma.user.count();

    const data = {
      counts: {
        tokens: tokenCount,
        pools: poolCount,
        users: userCount,
      },
      lastUpdated: new Date().toISOString(),
    };

    // Step 3: Cache the result
    await cache.set(CACHE_KEY, data, CACHE_TTL);

    return NextResponse.json({
      success: true,
      data,
      source: 'database',
    });
  } catch (error) {
    console.error('[API /example] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler - Database write with cache invalidation
 *
 * Pattern for write operations:
 * 1. Validate input
 * 2. Write to database
 * 3. Invalidate related cache keys
 * 4. Return success response
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Parse and validate input
    const body = await request.json();

    if (!body.tokenId || !body.symbol) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: tokenId, symbol',
        },
        { status: 400 }
      );
    }

    // Step 2: Write to database using upsert (insert or update)
    const token = await prisma.tokenMetadata.upsert({
      where: { tokenId: body.tokenId },
      update: {
        symbol: body.symbol,
        name: body.name || body.symbol,
        decimals: body.decimals ?? 8,
        logoUrl: body.logoUrl,
        priceUsd: body.priceUsd,
      },
      create: {
        tokenId: body.tokenId,
        symbol: body.symbol,
        name: body.name || body.symbol,
        decimals: body.decimals ?? 8,
        logoUrl: body.logoUrl,
        priceUsd: body.priceUsd,
      },
    });

    // Step 3: Invalidate related cache
    // Delete the example cache key since counts changed
    await cache.del(CACHE_KEY);

    // For more complex invalidation, you can use patterns:
    // await redis.keys('tokens:*').then(keys => keys.length && redis.del(...keys));

    return NextResponse.json({
      success: true,
      data: token,
    }, { status: 201 });
  } catch (error) {
    console.error('[API /example] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Advanced pattern: getOrSet with automatic cache refresh
 *
 * Use cache.getOrSet() for cleaner code when you always want to
 * return data (cached or fresh):
 *
 * @example
 * const data = await cache.getOrSet(
 *   'my:cache:key',
 *   async () => {
 *     // This fetcher only runs on cache miss
 *     return await prisma.someTable.findMany();
 *   },
 *   300 // TTL in seconds
 * );
 */
