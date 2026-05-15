/** @vitest-environment jsdom */
/**
 * useDemoGate Hook Tests
 *
 * Tests the demo gate logic which blocks features on mainnet when demo mode
 * is enabled. Per-wallet ungating (OKX/UniSat) was removed in 940f42d4 —
 * mainnet + DEMO_MODE_ENABLED is now the sole condition.
 *
 * Run with: pnpm test hooks/__tests__/useDemoGate.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the hook
// ---------------------------------------------------------------------------

const mockUseWallet = vi.fn();

vi.mock('@/context/WalletContext', () => ({
  useWallet: () => mockUseWallet(),
}));

// We need to control DEMO_MODE_ENABLED dynamically per test
let mockDemoEnabled = true;

vi.mock('@/utils/demoMode', () => ({
  get DEMO_MODE_ENABLED() {
    return mockDemoEnabled;
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useDemoGate } from '../useDemoGate';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDemoGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDemoEnabled = true;
    mockUseWallet.mockReturnValue({
      network: 'mainnet',
      browserWallet: null,
    });
  });

  it('returns true on mainnet when demo mode is enabled', () => {
    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true on regtest when demo mode is enabled', () => {
    mockUseWallet.mockReturnValue({
      network: 'subfrost-regtest',
      browserWallet: null,
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true on signet when demo mode is enabled', () => {
    mockUseWallet.mockReturnValue({
      network: 'signet',
      browserWallet: null,
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns false when demo mode is disabled on mainnet', () => {
    mockDemoEnabled = false;

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(false);
  });

  it('returns false when demo mode is disabled on regtest', () => {
    mockDemoEnabled = false;
    mockUseWallet.mockReturnValue({
      network: 'subfrost-regtest',
      browserWallet: null,
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(false);
  });

  it('returns true for OKX wallet on mainnet with demo mode (no per-wallet exemption)', () => {
    mockUseWallet.mockReturnValue({
      network: 'mainnet',
      browserWallet: { info: { id: 'okx' } },
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true for UniSat wallet on mainnet with demo mode (no per-wallet exemption)', () => {
    mockUseWallet.mockReturnValue({
      network: 'mainnet',
      browserWallet: { info: { id: 'unisat' } },
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true for Xverse wallet on mainnet with demo mode', () => {
    mockUseWallet.mockReturnValue({
      network: 'mainnet',
      browserWallet: { info: { id: 'xverse' } },
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true for OYL wallet on mainnet with demo mode', () => {
    mockUseWallet.mockReturnValue({
      network: 'mainnet',
      browserWallet: { info: { id: 'oyl' } },
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true when browserWallet has no info', () => {
    mockUseWallet.mockReturnValue({
      network: 'mainnet',
      browserWallet: { info: null },
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true when browserWallet is null on mainnet with demo', () => {
    mockUseWallet.mockReturnValue({
      network: 'mainnet',
      browserWallet: null,
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true for OKX on regtest with demo mode', () => {
    mockUseWallet.mockReturnValue({
      network: 'subfrost-regtest',
      browserWallet: { info: { id: 'okx' } },
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true when network is empty string and demo mode is enabled', () => {
    mockUseWallet.mockReturnValue({
      network: '',
      browserWallet: null,
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });

  it('returns true when network is undefined and demo mode is enabled', () => {
    mockUseWallet.mockReturnValue({
      network: undefined,
      browserWallet: null,
    });

    const { result } = renderHook(() => useDemoGate());
    expect(result.current).toBe(true);
  });
});
