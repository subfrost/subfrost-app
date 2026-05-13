import { describe, it, expect, vi, afterEach } from 'vitest';
import { NEXT_PUBLIC_DEMO_MODE } from '@/constants';

describe('demoMode', () => {
  const originalEnv = process.env.NEXT_PUBLIC_DEMO_MODE;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_DEMO_MODE = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_DEMO_MODE;
    }
    // Clear module cache so re-imports re-evaluate
    vi.resetModules();
  });

  it('NEXT_PUBLIC_DEMO_MODE is pinned to 0 in constants', () => {
    expect(NEXT_PUBLIC_DEMO_MODE).toBe(0);
  });

  it('DEMO_MODE_ENABLED ignores env var "1"', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = '1';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(true);
  });

  it('DEMO_MODE_ENABLED ignores an unset env var', async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(true);
  });

  it('DEMO_MODE_ENABLED is true when env var is "0"', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = '0';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(true);
  });

  it('DEMO_MODE_ENABLED ignores an empty env var', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = '';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(true);
  });

  it('DEMO_MODE_ENABLED ignores env var "true"', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(true);
  });
});
