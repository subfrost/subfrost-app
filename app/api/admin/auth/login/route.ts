import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createAdminSession } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await prisma.adminUser.findUnique({
      where: { username: username.trim().toLowerCase() },
    });

    if (!user || !user.isActive) {
      // Constant-time: still hash to prevent timing attacks
      await bcrypt.hash(password, 10);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const ua = request.headers.get('user-agent');
    const token = await createAdminSession(user.id, ip, ua);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    console.error('[API /admin/auth/login] Error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
