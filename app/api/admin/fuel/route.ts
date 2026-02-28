/**
 * GET /api/admin/fuel — List all FUEL allocations
 * POST /api/admin/fuel — Upsert a FUEL allocation
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/admin-auth';
import { ADMIN_PERMISSIONS } from '@/lib/admin-permissions';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

export async function GET(request: NextRequest) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.FUEL_READ);
  if (error) return error;

  try {
    const allocations = await prisma.fuelAllocation.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);

    return NextResponse.json({ allocations, totalAllocated });
  } catch (err) {
    console.error('[API /admin/fuel GET] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.FUEL_EDIT);
  if (error) return error;

  try {
    const body = await request.json();
    const address = body.address?.trim();
    const amount = parseFloat(body.amount);
    const note = body.note?.trim() || null;

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: 'Amount must be a non-negative number' }, { status: 400 });
    }
    // Round to 2 decimal places to enforce precision limit
    const roundedAmount = Math.round(amount * 100) / 100;

    const allocation = await prisma.fuelAllocation.upsert({
      where: { address },
      create: { address, amount: roundedAmount, note },
      update: { amount: roundedAmount, note },
    });

    // Invalidate cached public lookup
    await cache.del(`fuel:${address}`);

    return NextResponse.json(allocation, { status: 201 });
  } catch (err) {
    console.error('[API /admin/fuel POST] Error:', err);
    return NextResponse.json({ error: 'Failed to save allocation' }, { status: 500 });
  }
}
