/**
 * GET /api/admin/redemptions/export
 *
 * CSV download of all redemptions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const redemptions = await prisma.inviteCodeRedemption.findMany({
      orderBy: { redeemedAt: 'desc' },
      include: { inviteCode: { select: { code: true, description: true } } },
    });

    const header = 'id,code,code_description,taproot_address,segwit_address,taproot_pubkey,redeemed_at';
    const rows = redemptions.map((r) => {
      const escape = (v: string | null) => {
        if (!v) return '';
        if (v.includes(',') || v.includes('"') || v.includes('\n')) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      };
      return [
        r.id,
        r.inviteCode.code,
        escape(r.inviteCode.description),
        r.taprootAddress,
        r.segwitAddress || '',
        r.taprootPubkey || '',
        r.redeemedAt.toISOString(),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="redemptions-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('[API /admin/redemptions/export] Error:', error);
    return NextResponse.json({ error: 'Failed to export redemptions' }, { status: 500 });
  }
}
