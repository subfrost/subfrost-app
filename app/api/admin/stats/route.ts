/**
 * GET /api/admin/stats
 *
 * Dashboard statistics: total/active/inactive codes, total redemptions,
 * total users, recent 10 redemptions, top 10 codes by redemption count.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/admin-auth';
import { ADMIN_PERMISSIONS } from '@/lib/admin-permissions';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

const CACHE_KEY = 'admin:stats';
const CACHE_TTL = 30;

export async function GET(request: NextRequest) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.STATS_READ);
  if (error) return error;

  try {
    const cached = await cache.get(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const [totalCodes, activeCodes, totalRedemptions, totalUsers, recentRedemptions, topCodes, allRedemptionDates] =
      await Promise.all([
        prisma.inviteCode.count(),
        prisma.inviteCode.count({ where: { isActive: true } }),
        prisma.inviteCodeRedemption.count(),
        prisma.user.count(),
        prisma.inviteCodeRedemption.findMany({
          take: 10,
          orderBy: { redeemedAt: 'desc' },
          include: { inviteCode: { select: { code: true } } },
        }),
        prisma.inviteCode.findMany({
          take: 10,
          orderBy: { redemptions: { _count: 'desc' } },
          select: {
            id: true,
            code: true,
            description: true,
            isActive: true,
            _count: { select: { redemptions: true } },
          },
        }),
        prisma.inviteCodeRedemption.findMany({
          orderBy: { redeemedAt: 'asc' },
          select: { redeemedAt: true },
        }),
      ]);

    // Build daily redemption counts for cumulative graph
    const dailyCounts: Record<string, number> = {};
    for (const r of allRedemptionDates) {
      const day = r.redeemedAt.toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }
    const redemptionsByDay = Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const stats = {
      totalCodes,
      activeCodes,
      inactiveCodes: totalCodes - activeCodes,
      totalRedemptions,
      totalUsers,
      recentRedemptions,
      topCodes,
      redemptionsByDay,
    };

    await cache.set(CACHE_KEY, stats, CACHE_TTL);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[API /admin/stats] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
