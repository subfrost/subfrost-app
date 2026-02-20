import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSession } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-admin-token');
    if (!token) {
      // Legacy secret check
      const secret = request.headers.get('x-admin-secret');
      const expected = process.env.ADMIN_SECRET;
      if (expected && secret && secret === expected) {
        return NextResponse.json({
          user: {
            id: '__legacy__',
            username: 'admin',
            displayName: 'Legacy Admin',
            permissions: ['iam.owner'],
          },
        });
      }
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateAdminSession(token);
    if (!user) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('[API /admin/auth/me] Error:', error);
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
  }
}
