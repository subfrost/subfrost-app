/**
 * Invite Code Redemption API
 *
 * POST /api/invite-codes/redeem
 *
 * Records which wallet address used which invite code.
 * Called after successful wallet creation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

interface RedeemRequest {
  code: string;
  taprootAddress: string;
  segwitAddress?: string;
  taprootPubkey?: string;
}

interface RedeemResponse {
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<RedeemResponse>> {
  try {
    const body = await request.json() as RedeemRequest;
    const code = body.code?.trim().toUpperCase();
    const { taprootAddress, segwitAddress, taprootPubkey } = body;

    // Validate required fields
    if (!code) {
      return NextResponse.json({ success: false, error: 'Code is required' }, { status: 400 });
    }

    if (!taprootAddress) {
      return NextResponse.json({ success: false, error: 'Taproot address is required' }, { status: 400 });
    }

    // Find the invite code
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code },
      select: { id: true, isActive: true },
    });

    if (!inviteCode) {
      return NextResponse.json({ success: false, error: 'Invalid invite code' });
    }

    if (!inviteCode.isActive) {
      return NextResponse.json({ success: false, error: 'This invite code is no longer active' });
    }

    // Create redemption record (upsert to handle duplicates gracefully)
    try {
      await prisma.inviteCodeRedemption.upsert({
        where: {
          codeId_taprootAddress: {
            codeId: inviteCode.id,
            taprootAddress,
          },
        },
        update: {
          // Update with any new info if re-redeeming
          segwitAddress: segwitAddress || undefined,
          taprootPubkey: taprootPubkey || undefined,
        },
        create: {
          codeId: inviteCode.id,
          taprootAddress,
          segwitAddress,
          taprootPubkey,
        },
      });
    } catch (err) {
      // If unique constraint fails, that's okay - wallet already redeemed this code
      if ((err as { code?: string }).code === 'P2002') {
        console.log(`[API /invite-codes/redeem] Wallet ${taprootAddress} already redeemed ${code}`);
        return NextResponse.json({ success: true }); // Still return success
      }
      throw err;
    }

    // Invalidate cache for this code
    await cache.del(`invite:valid:${code}`);

    console.log(`[API /invite-codes/redeem] Recorded: ${code} -> ${taprootAddress}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /invite-codes/redeem] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to redeem code' },
      { status: 500 }
    );
  }
}
