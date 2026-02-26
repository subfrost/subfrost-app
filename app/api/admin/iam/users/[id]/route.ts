/**
 * GET /api/admin/iam/users/[id] — User detail
 * PATCH /api/admin/iam/users/[id] — Update user
 * DELETE /api/admin/iam/users/[id] — Deactivate user
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAdminPermission } from '@/lib/admin-auth';
import { ADMIN_PERMISSIONS, ALL_PERMISSIONS } from '@/lib/admin-permissions';
import { prisma } from '@/lib/db/prisma';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.IAM_OWNER);
  if (error) return error;

  try {
    const { id } = await context.params;
    const user = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        permissions: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (err) {
    console.error('[API /admin/iam/users/[id] GET] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { error, user: authedUser } = await requireAdminPermission(request, ADMIN_PERMISSIONS.IAM_OWNER);
  if (error) return error;

  try {
    const { id } = await context.params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.displayName !== undefined) data.displayName = body.displayName?.trim() || null;
    if (body.isActive !== undefined) {
      // Prevent deactivating yourself
      if (!body.isActive && authedUser && authedUser.id === id) {
        return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
      }
      data.isActive = body.isActive;
    }
    if (body.permissions !== undefined) {
      data.permissions = (body.permissions as string[]).filter(
        (p) => ALL_PERMISSIONS.includes(p as typeof ALL_PERMISSIONS[number])
      );
    }
    if (body.password) {
      if (body.password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        permissions: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    // If deactivated, destroy all their sessions
    if (data.isActive === false) {
      await prisma.adminSession.deleteMany({ where: { adminUserId: id } });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API /admin/iam/users/[id] PATCH] Error:', err);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { error, user: authedUser } = await requireAdminPermission(request, ADMIN_PERMISSIONS.IAM_OWNER);
  if (error) return error;

  try {
    const { id } = await context.params;

    // Prevent deleting yourself
    if (authedUser && authedUser.id === id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const user = await prisma.adminUser.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete sessions first, then user
    await prisma.adminSession.deleteMany({ where: { adminUserId: id } });
    await prisma.adminUser.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[API /admin/iam/users/[id] DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
