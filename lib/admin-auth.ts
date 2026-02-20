/**
 * Admin authentication — session-based with legacy ADMIN_SECRET fallback.
 *
 * Auth flow:
 * 1. Check `x-admin-token` header for a valid AdminSession token
 * 2. Verify the user has the required permission (or is iam.owner)
 *
 * JOURNAL 2026-02-20: Replaced single requireAdminAuth() with requireAdminPermission()
 * that returns the authenticated AdminUser for audit logging.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { hasPermission } from '@/lib/admin-permissions';

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  displayName: string | null;
  permissions: string[];
}

export interface AdminAuthResult {
  error?: NextResponse;
  user?: AuthenticatedAdmin;
}

/**
 * Authenticate and authorize an admin request.
 * Returns `{ user }` on success or `{ error }` (a NextResponse) on failure.
 */
export async function requireAdminPermission(
  request: NextRequest,
  permission: string
): Promise<AdminAuthResult> {
  // 1. Try session token
  const token = request.headers.get('x-admin-token');
  if (token) {
    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: { adminUser: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        // Clean up expired session
        await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
      }
      return {
        error: NextResponse.json({ error: 'Session expired' }, { status: 401 }),
      };
    }

    if (!session.adminUser.isActive) {
      return {
        error: NextResponse.json({ error: 'Account deactivated' }, { status: 403 }),
      };
    }

    if (!hasPermission(session.adminUser.permissions, permission)) {
      return {
        error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
      };
    }

    return {
      user: {
        id: session.adminUser.id,
        username: session.adminUser.username,
        displayName: session.adminUser.displayName,
        permissions: session.adminUser.permissions,
      },
    };
  }

  return {
    error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  };
}

/**
 * Create a new admin session. Returns the token string.
 */
export async function createAdminSession(
  adminUserId: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.adminSession.create({
    data: {
      token,
      adminUserId,
      expiresAt,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ? userAgent.slice(0, 500) : null,
    },
  });

  // Update last login
  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { lastLoginAt: new Date() },
  });

  return token;
}

/**
 * Destroy an admin session by token.
 */
export async function destroyAdminSession(token: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { token } });
}

/**
 * Validate a token and return the user info, or null if invalid.
 */
export async function validateAdminSession(
  token: string
): Promise<AuthenticatedAdmin | null> {
  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: { adminUser: true },
  });

  if (!session || session.expiresAt < new Date() || !session.adminUser.isActive) {
    return null;
  }

  return {
    id: session.adminUser.id,
    username: session.adminUser.username,
    displayName: session.adminUser.displayName,
    permissions: session.adminUser.permissions,
  };
}
