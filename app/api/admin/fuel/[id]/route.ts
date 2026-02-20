/**
 * DELETE /api/admin/fuel/[id] — Delete a FUEL allocation
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/admin-auth';
import { ADMIN_PERMISSIONS } from '@/lib/admin-permissions';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.FUEL_EDIT);
  if (error) return error;

  try {
    const { id } = await context.params;
    const allocation = await prisma.fuelAllocation.findUnique({ where: { id } });
    if (!allocation) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 });
    }

    await prisma.fuelAllocation.delete({ where: { id } });
    await cache.del(`fuel:${allocation.address}`);

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[API /admin/fuel/[id] DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete allocation' }, { status: 500 });
  }
}
