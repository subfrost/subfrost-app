/**
 * POST /api/admin/codes/bulk
 *
 * Bulk-generate invite codes with a given prefix.
 * Body: { prefix: string, count: number (max 500), description?: string, parentCodeId?: string }
 * Generates codes in the format PREFIX-XXXXX (5 random alphanumeric chars).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';
import crypto from 'crypto';

function generateSuffix(): string {
  return crypto.randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const prefix = body.prefix?.trim().toUpperCase();
    const count = parseInt(body.count, 10);
    const description = body.description || null;
    const parentCodeId = body.parentCodeId || null;

    if (!prefix || prefix.length < 2) {
      return NextResponse.json({ error: 'Prefix must be at least 2 characters' }, { status: 400 });
    }
    if (!count || count < 1 || count > 500) {
      return NextResponse.json({ error: 'Count must be between 1 and 500' }, { status: 400 });
    }

    // Generate unique codes, retrying on collision
    const codes: string[] = [];
    const existing = new Set(
      (await prisma.inviteCode.findMany({
        where: { code: { startsWith: prefix } },
        select: { code: true },
      })).map((c) => c.code)
    );

    let attempts = 0;
    while (codes.length < count && attempts < count * 10) {
      const candidate = `${prefix}-${generateSuffix()}`;
      if (!existing.has(candidate)) {
        codes.push(candidate);
        existing.add(candidate);
      }
      attempts++;
    }

    const created = await prisma.inviteCode.createMany({
      data: codes.map((code) => ({
        code,
        description,
        parentCodeId,
      })),
    });

    await cache.del('admin:stats');

    return NextResponse.json({
      count: created.count,
      codes,
    }, { status: 201 });
  } catch (error) {
    console.error('[API /admin/codes/bulk] Error:', error);
    return NextResponse.json({ error: 'Failed to bulk generate codes' }, { status: 500 });
  }
}
