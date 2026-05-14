import { describe, it, expect } from 'vitest';
import { NEXT_PUBLIC_DEMO_MODE } from '@/constants';
import { DEMO_MODE_ENABLED } from '../demoMode';

describe('demoMode', () => {
  it('uses the compile-time demo-mode constant', () => {
    expect(NEXT_PUBLIC_DEMO_MODE).toBe(0);
    expect(DEMO_MODE_ENABLED).toBe(true);
  });
});
