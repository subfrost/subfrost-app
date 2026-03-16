/**
 * API Route: Lookup invite code by taproot address
 *
 * GET /api/invite-codes/lookup?address={taprootAddress}
 * Auth: X-API-Key header (for cross-service calls from subfrost.io)
 *
 * Returns: { found, code, codeDescription, parentCode }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';

const API_KEY = process.env.INVITE_LOOKUP_API_KEY || process.env.SUBFROST_INTERNAL_API_KEY;

export async function GET(request: NextRequest) {
  // Validate API key
  const providedKey = request.headers.get('X-API-Key');
  if (!API_KEY || providedKey !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }

  try {
    // Look up redemption by taproot address
    const redemption = await prisma.inviteCodeRedemption.findFirst({
      where: { taprootAddress: address },
      include: {
        code: {
          include: {
            parentCode: true,
          },
        },
      },
      orderBy: { redeemedAt: 'desc' },
    });

    if (!redemption) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      code: redemption.code.code,
      codeDescription: redemption.code.description,
      parentCode: redemption.code.parentCode?.code || null,
    });
  } catch (error) {
    console.error('[Invite Lookup] Error:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
