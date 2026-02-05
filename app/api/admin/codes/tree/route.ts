/**
 * GET /api/admin/codes/tree
 *
 * Returns hierarchical tree of invite codes.
 * Root codes (no parent) with nested children, each with redemption count.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const allCodes = await prisma.inviteCode.findMany({
      select: {
        id: true,
        code: true,
        description: true,
        isActive: true,
        parentCodeId: true,
        ownerTaprootAddress: true,
        _count: { select: { redemptions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build tree in memory
    type TreeNode = (typeof allCodes)[number] & { children: TreeNode[] };
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const code of allCodes) {
      nodeMap.set(code.id, { ...code, children: [] });
    }

    for (const code of allCodes) {
      const node = nodeMap.get(code.id)!;
      if (code.parentCodeId && nodeMap.has(code.parentCodeId)) {
        nodeMap.get(code.parentCodeId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return NextResponse.json(roots);
  } catch (error) {
    console.error('[API /admin/codes/tree] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch code tree' }, { status: 500 });
  }
}
