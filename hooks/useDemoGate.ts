import { DEMO_MODE_ENABLED } from '@/utils/demoMode';

/**
 * Returns true when features should be blocked by public demo mode.
 * Returns false when features should work normally.
 */
export function useDemoGate(): boolean {
  return DEMO_MODE_ENABLED;
}
