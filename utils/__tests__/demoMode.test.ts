import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

  it('DEMO_MODE_ENABLED is true when env var is "1"', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = '1';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(true);
  });

  it('DEMO_MODE_ENABLED is false when env var is unset', async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(false);
  });

  it('DEMO_MODE_ENABLED is false when env var is "0"', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = '0';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(false);
  });

  it('DEMO_MODE_ENABLED is false when env var is empty string', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = '';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(false);
  });

  it('DEMO_MODE_ENABLED is false when env var is "true" (only "1" activates)', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    const { DEMO_MODE_ENABLED } = await import('../demoMode');
    expect(DEMO_MODE_ENABLED).toBe(false);
  });
});
