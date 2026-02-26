/**
 * GET /api/admin/iam/users — List admin users
 * POST /api/admin/iam/users — Create admin user
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAdminPermission } from '@/lib/admin-auth';
import { ADMIN_PERMISSIONS, ALL_PERMISSIONS } from '@/lib/admin-permissions';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.IAM_OWNER);
  if (error) return error;

  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        permissions: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error('[API /admin/iam/users GET] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminPermission(request, ADMIN_PERMISSIONS.IAM_OWNER);
  if (error) return error;

  try {
    const body = await request.json();
    const username = body.username?.trim().toLowerCase();
    const password = body.password;
    const displayName = body.displayName?.trim() || null;
    const permissions: string[] = body.permissions || [];

    if (!username || username.length < 2) {
      return NextResponse.json({ error: 'Username must be at least 2 characters' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Validate permissions
    const validPerms = permissions.filter((p: string) => ALL_PERMISSIONS.includes(p as typeof ALL_PERMISSIONS[number]));

    const existing = await prisma.adminUser.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.adminUser.create({
      data: { username, passwordHash, displayName, permissions: validPerms },
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        permissions: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error('[API /admin/iam/users POST] Error:', err);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
