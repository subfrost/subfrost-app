/**
 * GET /api/admin/codes/[id] — Single code detail with relations
 * PATCH /api/admin/codes/[id] — Update code fields
 * DELETE /api/admin/codes/[id] — Delete code (cascades to redemptions)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const code = await prisma.inviteCode.findUnique({
      where: { id },
      include: {
        redemptions: { orderBy: { redeemedAt: 'desc' } },
        childCodes: {
          select: { id: true, code: true, isActive: true, _count: { select: { redemptions: true } } },
        },
        parentCode: { select: { id: true, code: true } },
      },
    });

    if (!code) {
      return NextResponse.json({ error: 'Code not found' }, { status: 404 });
    }

    return NextResponse.json(code);
  } catch (error) {
    console.error('[API /admin/codes/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch code' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.description !== undefined) data.description = body.description;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.ownerTaprootAddress !== undefined) data.ownerTaprootAddress = body.ownerTaprootAddress;

    const updated = await prisma.inviteCode.update({
      where: { id },
      data,
    });

    await cache.del('admin:stats');
    if (!updated.isActive) {
      await cache.del(`invite:valid:${updated.code}`);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[API /admin/codes/[id] PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update code' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const code = await prisma.inviteCode.findUnique({ where: { id } });
    if (!code) {
      return NextResponse.json({ error: 'Code not found' }, { status: 404 });
    }

    await prisma.inviteCode.delete({ where: { id } });

    await cache.del('admin:stats');
    await cache.del(`invite:valid:${code.code}`);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[API /admin/codes/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete code' }, { status: 500 });
  }
}
