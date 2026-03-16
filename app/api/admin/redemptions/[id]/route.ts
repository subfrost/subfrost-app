/**
 * PATCH /api/admin/redemptions/[id] — Update redemption (change code)
 * DELETE /api/admin/redemptions/[id] — Delete redemption
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/admin-auth';
import { ADMIN_PERMISSIONS } from '@/lib/admin-permissions';
import { prisma } from '@/lib/db/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.REDEMPTIONS_EDIT);
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { codeId } = body;

    if (!codeId) {
      return NextResponse.json({ error: 'codeId is required' }, { status: 400 });
    }

    // Verify the target code exists
    const targetCode = await prisma.inviteCode.findUnique({ where: { id: codeId } });
    if (!targetCode) {
      return NextResponse.json({ error: 'Target code not found' }, { status: 404 });
    }

    // Verify redemption exists
    const existing = await prisma.inviteCodeRedemption.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Redemption not found' }, { status: 404 });
    }

    // Check for duplicate (same code + same address)
    if (codeId !== existing.codeId) {
      const duplicate = await prisma.inviteCodeRedemption.findUnique({
        where: { codeId_taprootAddress: { codeId, taprootAddress: existing.taprootAddress } },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `This address already has a redemption for code ${targetCode.code}` },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.inviteCodeRedemption.update({
      where: { id },
      data: { codeId, updatedAt: new Date() },
      include: { inviteCode: { select: { id: true, code: true, description: true } } },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API /admin/redemptions/[id] PATCH] Error:', err);
    return NextResponse.json({ error: 'Failed to update redemption' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.REDEMPTIONS_EDIT);
  if (error) return error;

  try {
    const { id } = await params;

    const existing = await prisma.inviteCodeRedemption.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Redemption not found' }, { status: 404 });
    }

    await prisma.inviteCodeRedemption.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /admin/redemptions/[id] DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete redemption' }, { status: 500 });
  }
}
