import { NextRequest, NextResponse } from 'next/server';
import { destroyAdminSession } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-admin-token');
    if (token) {
      await destroyAdminSession(token);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API /admin/auth/logout] Error:', error);
    return NextResponse.json({ ok: true }); // Always succeed logout
  }
}
