/**
 * GET /api/admin/codes — List codes with search, filter, pagination
 * POST /api/admin/codes — Create a single code
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { ownerTaprootAddress: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const [codes, total] = await Promise.all([
      prisma.inviteCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { redemptions: true, childCodes: true } },
          parentCode: { select: { id: true, code: true } },
        },
      }),
      prisma.inviteCode.count({ where }),
    ]);

    return NextResponse.json({
      codes,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[API /admin/codes GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch codes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const code = body.code?.trim().toUpperCase();

    if (!code || code.length < 3) {
      return NextResponse.json({ error: 'Code must be at least 3 characters' }, { status: 400 });
    }

    const existing = await prisma.inviteCode.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: 'Code already exists' }, { status: 409 });
    }

    const created = await prisma.inviteCode.create({
      data: {
        code,
        description: body.description || null,
        parentCodeId: body.parentCodeId || null,
        ownerTaprootAddress: body.ownerTaprootAddress || null,
      },
    });

    await cache.del('admin:stats');
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[API /admin/codes POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create code' }, { status: 500 });
  }
}
