/**
 * Invite Code Validation API
 *
 * POST /api/invite-codes/validate
 *
 * Validates that an invite code exists and is active.
 * Used during the invite code entry step before wallet creation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

const CACHE_TTL = 60; // Cache valid codes for 60 seconds

interface ValidateRequest {
  code: string;
}

interface ValidateResponse {
  valid: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ValidateResponse>> {
  try {
    const body = await request.json() as ValidateRequest;
    const code = body.code?.trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Code is required' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = `invite:valid:${code}`;
    const cached = await cache.get<boolean>(cacheKey);
    if (cached === true) {
      return NextResponse.json({ valid: true });
    }

    // Query database
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code },
      select: { isActive: true },
    });

    if (!inviteCode) {
      return NextResponse.json({ valid: false, error: 'Invalid invite code' });
    }

    if (!inviteCode.isActive) {
      return NextResponse.json({ valid: false, error: 'This invite code is no longer active' });
    }

    // Cache the valid result
    await cache.set(cacheKey, true, CACHE_TTL);

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('[API /invite-codes/validate] Error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to validate code' },
      { status: 500 }
    );
  }
}
