/**
 * GET /api/admin/redemptions
 *
 * List redemptions with search, code filter, and pagination.
 * Query params: ?search=&code=&page=1&limit=25
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const codeFilter = searchParams.get('code') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { taprootAddress: { contains: search, mode: 'insensitive' } },
        { segwitAddress: { contains: search, mode: 'insensitive' } },
        { inviteCode: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (codeFilter) {
      where.inviteCode = { code: codeFilter };
    }

    const [redemptions, total] = await Promise.all([
      prisma.inviteCodeRedemption.findMany({
        where,
        skip,
        take: limit,
        orderBy: { redeemedAt: 'desc' },
        include: { inviteCode: { select: { id: true, code: true, description: true } } },
      }),
      prisma.inviteCodeRedemption.count({ where }),
    ]);

    return NextResponse.json({
      redemptions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[API /admin/redemptions] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch redemptions' }, { status: 500 });
  }
}
