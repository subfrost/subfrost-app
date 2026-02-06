/**
 * Admin authentication utility
 *
 * Checks the x-admin-secret header against the ADMIN_SECRET env var.
 * Used by all /api/admin/* routes.
 */
import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns null if auth passes, or a 401 NextResponse if it fails.
 * Call at the top of every admin API route handler.
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  const secret = request.headers.get('x-admin-secret');
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET not configured on server' },
      { status: 500 }
    );
  }

  if (!secret || secret !== expected) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null;
}
