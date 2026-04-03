/**
 * Boot Log Relay — streams browser-side [devnet-boot] console logs to a server file.
 *
 * POST /api/boot-log   — browser sends { lines: string[] }, appended to /tmp/subfrost-boot.log
 * GET  /api/boot-log   — returns last N lines of the log file as plain text (for polling)
 *
 * Only active on localhost. No-ops on any other host to prevent log leakage in production.
 */

import { appendFileSync, readFileSync, existsSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';

const LOG_FILE = '/tmp/subfrost-boot.log';
const MAX_LINES_RETURNED = 200;

function isLocalhost(req: NextRequest): boolean {
  const host = req.headers.get('host') || '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

export async function POST(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ ok: false, reason: 'not localhost' }, { status: 403 });
  }

  let body: { lines?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const lines = body.lines ?? [];
  if (lines.length === 0) return NextResponse.json({ ok: true });

  const text = lines.join('\n') + '\n';
  try {
    appendFileSync(LOG_FILE, text);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, written: lines.length });
}

export async function GET(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  if (!existsSync(LOG_FILE)) {
    return new NextResponse('(log file not yet created)\n', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const raw = readFileSync(LOG_FILE, 'utf-8');
  const lines = raw.split('\n');
  const tail = lines.slice(-MAX_LINES_RETURNED).join('\n');
  return new NextResponse(tail, { headers: { 'Content-Type': 'text/plain' } });
}
