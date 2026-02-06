/**
 * Database and cache exports
 *
 * Usage:
 *   import { prisma, redis, cache } from '@/lib/db';
 */
export { prisma, default as prismaClient } from './prisma';
export { redis, cache, default as redisClient } from './redis';
