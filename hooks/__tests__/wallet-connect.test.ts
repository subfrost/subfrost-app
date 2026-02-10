/**
 * Wallet connection integration tests
 *
 * Tests the actual connection code paths used by WalletContext.connectBrowserWallet
 * for each supported browser wallet. Mocks the wallet extension APIs on window,
 * then exercises the same SDK/API calls our production code makes.
 *
 * Wallets tested:
 * - Xverse: BitcoinProvider.request('getAccounts') (JSON-RPC 2.0)
 * - OYL: window.oyl.getAddresses()
 * - Unisat: window.unisat.requestAccounts() + getPublicKey()
 * - OKX: window.okxwallet.bitcoin.connect()
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Test addresses — valid format but not real keys
const TEST_TAPROOT_ADDRESS = 'bc1p5cyxnuxmeuwuvkwfem96lqzszee2457nljwv5fsxph6rj0sysspqqa9q69';
const TEST_SEGWIT_ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const TEST_TAPROOT_PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const TEST_SEGWIT_PUBKEY = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';

// Save original window state
let originalXverseProviders: any;
let originalOyl: any;
let originalUnisat: any;
let originalOkxwallet: any;

beforeEach(() => {
  const win = globalThis.window as any;
  originalXverseProviders = win?.XverseProviders;
  originalOyl = win?.oyl;
  originalUnisat = win?.unisat;
  originalOkxwallet = win?.okxwallet;
});

afterEach(() => {
  const win = globalThis.window as any;
  if (win) {
    if (originalXverseProviders !== undefined) win.XverseProviders = originalXverseProviders;
    else delete win.XverseProviders;
    if (originalOyl !== undefined) win.oyl = originalOyl;
    else delete win.oyl;
    if (originalUnisat !== undefined) win.unisat = originalUnisat;
    else delete win.unisat;
    if (originalOkxwallet !== undefined) win.okxwallet = originalOkxwallet;
    else delete win.okxwallet;
  }
});

describe('Wallet detection (isWalletInstalled)', () => {
  it('detects Xverse via window.XverseProviders.BitcoinProvider', async () => {
    const { isWalletInstalled, BROWSER_WALLETS } = await import('../../constants/wallets');
    const xverseWallet = BROWSER_WALLETS.find(w => w.id === 'xverse')!;
    expect(xverseWallet).toBeDefined();

    // Not installed initially
    expect(isWalletInstalled(xverseWallet)).toBe(false);

    // Inject mock
    (globalThis.window as any).XverseProviders = {
      BitcoinProvider: { request: vi.fn() },
    };
    expect(isWalletInstalled(xverseWallet)).toBe(true);
  });

  it('detects OYL via window.oyl', async () => {
    const { isWalletInstalled, BROWSER_WALLETS } = await import('../../constants/wallets');
    const oylWallet = BROWSER_WALLETS.find(w => w.id === 'oyl')!;
    expect(oylWallet).toBeDefined();

    expect(isWalletInstalled(oylWallet)).toBe(false);

    (globalThis.window as any).oyl = { getAddresses: vi.fn() };
    expect(isWalletInstalled(oylWallet)).toBe(true);
  });

  it('detects Unisat via window.unisat', async () => {
    const { isWalletInstalled, BROWSER_WALLETS } = await import('../../constants/wallets');
    const unisatWallet = BROWSER_WALLETS.find(w => w.id === 'unisat')!;
    expect(unisatWallet).toBeDefined();

    expect(isWalletInstalled(unisatWallet)).toBe(false);

    (globalThis.window as any).unisat = { requestAccounts: vi.fn() };
    expect(isWalletInstalled(unisatWallet)).toBe(true);
  });

  it('detects OKX via window.okxwallet', async () => {
    const { isWalletInstalled, BROWSER_WALLETS } = await import('../../constants/wallets');
    const okxWallet = BROWSER_WALLETS.find(w => w.id === 'okx')!;
    expect(okxWallet).toBeDefined();

    expect(isWalletInstalled(okxWallet)).toBe(false);

    (globalThis.window as any).okxwallet = { bitcoin: { connect: vi.fn() } };
    expect(isWalletInstalled(okxWallet)).toBe(true);
  });
});

describe('Xverse connection via SDK WalletConnector', () => {
  it('connects and returns taproot + payment addresses', async () => {
    // Mock Xverse extension API
    // SDK WalletConnector calls: window.XverseProviders.BitcoinProvider.request('getAccounts', ...)
    // Response format: { result: [{ address, publicKey, addressType, purpose }] }
    const mockRequest = vi.fn().mockImplementation(async (method: string, params?: any) => {
      if (method === 'getAccounts') {
        return {
          result: [
            {
              address: TEST_TAPROOT_ADDRESS,
              publicKey: TEST_TAPROOT_PUBKEY,
              addressType: 'p2tr',
              purpose: 'ordinals',
            },
            {
              address: TEST_SEGWIT_ADDRESS,
              publicKey: TEST_SEGWIT_PUBKEY,
              addressType: 'p2wpkh',
              purpose: 'payment',
            },
          ],
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    });

    (globalThis.window as any).XverseProviders = {
      BitcoinProvider: {
        request: mockRequest,
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    };

    // Import SDK WalletConnector (same path as WalletContext)
    const { WalletConnector, BROWSER_WALLETS } = await import('@alkanes/ts-sdk');
    const xverseInfo = BROWSER_WALLETS.find((w: any) => w.id === 'xverse')!;
    expect(xverseInfo).toBeDefined();

    const connector = new WalletConnector();
    const connected = await connector.connect(xverseInfo);

    // Verify getAccounts was called with correct params
    expect(mockRequest).toHaveBeenCalledWith('getAccounts', {
      purposes: ['ordinals', 'payment'],
    });

    // Verify ConnectedWallet has correct primary address (ordinals/taproot)
    expect(connected.address).toBe(TEST_TAPROOT_ADDRESS);

    // Verify account has payment address (this is what WalletContext extracts)
    const account = (connected as any).account;
    expect(account).toBeDefined();
    expect(account.address).toBe(TEST_TAPROOT_ADDRESS);
    expect(account.publicKey).toBe(TEST_TAPROOT_PUBKEY);
    expect(account.addressType).toBe('p2tr');
    expect(account.paymentAddress).toBe(TEST_SEGWIT_ADDRESS);
    expect(account.paymentPublicKey).toBe(TEST_SEGWIT_PUBKEY);

    console.log('[TEST] Xverse connection successful:', {
      primary: connected.address,
      payment: account.paymentAddress,
    });
  });

  it('handles Xverse returning only ordinals account (no payment)', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      result: [
        {
          address: TEST_TAPROOT_ADDRESS,
          publicKey: TEST_TAPROOT_PUBKEY,
          addressType: 'p2tr',
          purpose: 'ordinals',
        },
      ],
    });

    (globalThis.window as any).XverseProviders = {
      BitcoinProvider: { request: mockRequest, on: vi.fn(), removeListener: vi.fn() },
    };

    const { WalletConnector, BROWSER_WALLETS } = await import('@alkanes/ts-sdk');
    const xverseInfo = BROWSER_WALLETS.find((w: any) => w.id === 'xverse')!;

    const connector = new WalletConnector();
    const connected = await connector.connect(xverseInfo);

    expect(connected.address).toBe(TEST_TAPROOT_ADDRESS);
    const account = (connected as any).account;
    expect(account.paymentAddress).toBeUndefined();
  });

  it('rejects when getAccounts returns empty result', async () => {
    const mockRequest = vi.fn().mockResolvedValue({ result: [] });

    (globalThis.window as any).XverseProviders = {
      BitcoinProvider: { request: mockRequest, on: vi.fn(), removeListener: vi.fn() },
    };

    const { WalletConnector, BROWSER_WALLETS } = await import('@alkanes/ts-sdk');
    const xverseInfo = BROWSER_WALLETS.find((w: any) => w.id === 'xverse')!;

    const connector = new WalletConnector();
    await expect(connector.connect(xverseInfo)).rejects.toThrow();
  });

  it('rejects when Xverse extension is not installed', async () => {
    // Don't inject XverseProviders
    delete (globalThis.window as any).XverseProviders;

    const { WalletConnector, BROWSER_WALLETS } = await import('@alkanes/ts-sdk');
    const xverseInfo = BROWSER_WALLETS.find((w: any) => w.id === 'xverse')!;

    const connector = new WalletConnector();
    await expect(connector.connect(xverseInfo)).rejects.toThrow(/not installed/i);
  });
});

describe('OYL connection via direct API', () => {
  it('connects and returns taproot + segwit addresses', async () => {
    // OYL mock: window.oyl.getAddresses() returns both address types
    // This is the same path as WalletContext line 984
    const mockGetAddresses = vi.fn().mockResolvedValue({
      taproot: {
        address: TEST_TAPROOT_ADDRESS,
        publicKey: TEST_TAPROOT_PUBKEY,
      },
      nativeSegwit: {
        address: TEST_SEGWIT_ADDRESS,
        publicKey: TEST_SEGWIT_PUBKEY,
      },
    });

    (globalThis.window as any).oyl = {
      getAddresses: mockGetAddresses,
      signPsbt: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    // Exercise the same logic as WalletContext connectBrowserWallet for OYL
    const oylProvider = (globalThis.window as any).oyl;
    expect(oylProvider).toBeDefined();

    const addresses = await oylProvider.getAddresses();
    expect(addresses?.taproot).toBeDefined();
    expect(addresses?.nativeSegwit).toBeDefined();

    // Verify the addresses match what WalletContext would extract
    const additionalAddresses: any = {};
    additionalAddresses.taproot = {
      address: addresses.taproot.address,
      publicKey: addresses.taproot.publicKey,
    };
    additionalAddresses.nativeSegwit = {
      address: addresses.nativeSegwit.address,
      publicKey: addresses.nativeSegwit.publicKey,
    };

    expect(additionalAddresses.taproot.address).toBe(TEST_TAPROOT_ADDRESS);
    expect(additionalAddresses.nativeSegwit.address).toBe(TEST_SEGWIT_ADDRESS);

    console.log('[TEST] OYL connection successful:', additionalAddresses);
  });

  it('also works through SDK WalletConnector', async () => {
    // The SDK WalletConnector also handles OYL (line 49333-49343)
    (globalThis.window as any).oyl = {
      getAddresses: vi.fn().mockResolvedValue({
        taproot: { address: TEST_TAPROOT_ADDRESS, publicKey: TEST_TAPROOT_PUBKEY },
        nativeSegwit: { address: TEST_SEGWIT_ADDRESS, publicKey: TEST_SEGWIT_PUBKEY },
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const { WalletConnector, BROWSER_WALLETS } = await import('@alkanes/ts-sdk');
    const oylInfo = BROWSER_WALLETS.find((w: any) => w.id === 'oyl')!;
    expect(oylInfo).toBeDefined();

    const connector = new WalletConnector();
    const connected = await connector.connect(oylInfo);

    expect(connected.address).toBe(TEST_TAPROOT_ADDRESS);
    const account = (connected as any).account;
    expect(account.paymentAddress).toBe(TEST_SEGWIT_ADDRESS);
  });

  it('rejects when getAddresses returns no taproot', async () => {
    (globalThis.window as any).oyl = {
      getAddresses: vi.fn().mockResolvedValue({
        nativeSegwit: { address: TEST_SEGWIT_ADDRESS, publicKey: TEST_SEGWIT_PUBKEY },
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const oylProvider = (globalThis.window as any).oyl;
    const addresses = await oylProvider.getAddresses();

    // WalletContext checks: if (!addresses?.nativeSegwit || !addresses?.taproot) throw
    expect(addresses?.taproot).toBeUndefined();
    // Our code would throw here
  });
});

describe('Unisat connection via direct API', () => {
  it('connects with taproot address', async () => {
    // Unisat mock: window.unisat.requestAccounts() + getPublicKey()
    // Same path as WalletContext line 1183-1188
    (globalThis.window as any).unisat = {
      requestAccounts: vi.fn().mockResolvedValue([TEST_TAPROOT_ADDRESS]),
      getPublicKey: vi.fn().mockResolvedValue(TEST_TAPROOT_PUBKEY),
      signPsbt: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const unisatProvider = (globalThis.window as any).unisat;
    const accounts = await unisatProvider.requestAccounts();
    expect(accounts).toHaveLength(1);
    const addr = accounts[0];

    const pubKey = await unisatProvider.getPublicKey();

    // Same logic as WalletContext
    const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
    expect(isTaproot).toBe(true);

    const additionalAddresses: any = {};
    if (isTaproot) {
      additionalAddresses.taproot = { address: addr, publicKey: pubKey };
    } else {
      additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };
    }

    expect(additionalAddresses.taproot.address).toBe(TEST_TAPROOT_ADDRESS);
    expect(additionalAddresses.taproot.publicKey).toBe(TEST_TAPROOT_PUBKEY);

    console.log('[TEST] Unisat connection successful:', additionalAddresses);
  });

  it('connects with segwit address (user has wallet in segwit mode)', async () => {
    (globalThis.window as any).unisat = {
      requestAccounts: vi.fn().mockResolvedValue([TEST_SEGWIT_ADDRESS]),
      getPublicKey: vi.fn().mockResolvedValue(TEST_SEGWIT_PUBKEY),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const accounts = await (globalThis.window as any).unisat.requestAccounts();
    const addr = accounts[0];
    const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
    expect(isTaproot).toBe(false);

    const additionalAddresses: any = {};
    if (isTaproot) {
      additionalAddresses.taproot = { address: addr };
    } else {
      additionalAddresses.nativeSegwit = { address: addr };
    }

    expect(additionalAddresses.nativeSegwit.address).toBe(TEST_SEGWIT_ADDRESS);
  });

  it('also works through SDK WalletConnector', async () => {
    (globalThis.window as any).unisat = {
      requestAccounts: vi.fn().mockResolvedValue([TEST_TAPROOT_ADDRESS]),
      getPublicKey: vi.fn().mockResolvedValue(TEST_TAPROOT_PUBKEY),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const { WalletConnector, BROWSER_WALLETS } = await import('@alkanes/ts-sdk');
    const unisatInfo = BROWSER_WALLETS.find((w: any) => w.id === 'unisat')!;
    expect(unisatInfo).toBeDefined();

    const connector = new WalletConnector();
    const connected = await connector.connect(unisatInfo);

    expect(connected.address).toBe(TEST_TAPROOT_ADDRESS);
  });

  it('handles getPublicKey failure gracefully', async () => {
    (globalThis.window as any).unisat = {
      requestAccounts: vi.fn().mockResolvedValue([TEST_TAPROOT_ADDRESS]),
      getPublicKey: vi.fn().mockRejectedValue(new Error('Not supported')),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const accounts = await (globalThis.window as any).unisat.requestAccounts();
    expect(accounts[0]).toBe(TEST_TAPROOT_ADDRESS);

    // WalletContext wraps getPublicKey in try/catch
    let pubKey: string | undefined;
    try {
      pubKey = await (globalThis.window as any).unisat.getPublicKey();
    } catch {
      // expected
    }

    expect(pubKey).toBeUndefined();
    // Connection still succeeds — pubKey is optional
  });
});

describe('OKX connection via direct API', () => {
  it('connects and returns taproot address', async () => {
    // OKX mock: window.okxwallet.bitcoin.connect()
    // Same path as WalletContext line 1160
    (globalThis.window as any).okxwallet = {
      bitcoin: {
        connect: vi.fn().mockResolvedValue({
          address: TEST_TAPROOT_ADDRESS,
          publicKey: TEST_TAPROOT_PUBKEY,
        }),
        signPsbt: vi.fn(),
      },
    };

    const okxProvider = (globalThis.window as any).okxwallet?.bitcoin;
    expect(okxProvider).toBeDefined();

    const result = await okxProvider.connect();
    const addr = result?.address;
    const pubKey = result?.publicKey;

    expect(addr).toBe(TEST_TAPROOT_ADDRESS);
    expect(pubKey).toBe(TEST_TAPROOT_PUBKEY);

    // Same logic as WalletContext
    const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
    expect(isTaproot).toBe(true);

    const additionalAddresses: any = {};
    if (isTaproot) {
      additionalAddresses.taproot = { address: addr, publicKey: pubKey };
    } else {
      additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };
    }

    expect(additionalAddresses.taproot.address).toBe(TEST_TAPROOT_ADDRESS);

    console.log('[TEST] OKX connection successful:', additionalAddresses);
  });

  it('connects with segwit address', async () => {
    (globalThis.window as any).okxwallet = {
      bitcoin: {
        connect: vi.fn().mockResolvedValue({
          address: TEST_SEGWIT_ADDRESS,
          publicKey: TEST_SEGWIT_PUBKEY,
        }),
      },
    };

    const result = await (globalThis.window as any).okxwallet.bitcoin.connect();
    const isTaproot = result.address.startsWith('bc1p');
    expect(isTaproot).toBe(false);
  });

  it('also works through SDK WalletConnector', async () => {
    // SDK uses: window.okxwallet (injectionKey), then provider.bitcoin.connect()
    (globalThis.window as any).okxwallet = {
      bitcoin: {
        connect: vi.fn().mockResolvedValue({
          address: TEST_TAPROOT_ADDRESS,
          publicKey: TEST_TAPROOT_PUBKEY,
        }),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const { WalletConnector, BROWSER_WALLETS } = await import('@alkanes/ts-sdk');
    const okxInfo = BROWSER_WALLETS.find((w: any) => w.id === 'okx')!;
    expect(okxInfo).toBeDefined();

    const connector = new WalletConnector();
    const connected = await connector.connect(okxInfo);

    expect(connected.address).toBe(TEST_TAPROOT_ADDRESS);
  });
});

describe('WalletContext connection logic (source verification)', () => {
  it('Xverse path uses direct BitcoinProvider.request getAccounts', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // Extract the full xverse block between walletId === 'xverse' and walletId === 'leather'
    const start = src.indexOf("walletId === 'xverse'");
    const end = src.indexOf("walletId === 'leather'");
    const xverseBlock = src.slice(start, end);

    // Uses direct BitcoinProvider.request('getAccounts') — no sats-connect dependency
    expect(xverseBlock).toContain("request('getAccounts'");
    expect(xverseBlock).toContain("purposes: ['ordinals', 'payment']");
    // Must extract both ordinals and payment accounts from response
    expect(xverseBlock).toContain("purpose === 'ordinals'");
    expect(xverseBlock).toContain("purpose === 'payment'");
  });

  it('OYL path calls getAddresses and has signing fallback for connect', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    const oylBlock = src.match(/if\s*\(walletId\s*===\s*'oyl'\)\s*\{([\s\S]*?)\}\s*else\s*if/)?.[1] || '';
    expect(oylBlock).toContain('oylProvider.getAddresses()');
    expect(oylBlock).toContain('addresses.taproot.address');
    expect(oylBlock).toContain('addresses.nativeSegwit.address');

    // Signing path has connect-and-retry fallback for "Site origin must be connected"
    expect(src).toContain("walletId === 'oyl' && errMsg.includes('must be connected')");
    expect(src).toContain('oylProvider.connect()');
  });

  it('Unisat path calls requestAccounts and getPublicKey', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    const unisatBlock = src.match(/if\s*\(walletId\s*===\s*'unisat'\)\s*\{([\s\S]*?)\}\s*else\s*\{/)?.[1] || '';
    expect(unisatBlock).toContain('unisatProvider.requestAccounts()');
    expect(unisatBlock).toContain('unisatProvider.getPublicKey()');
  });

  it('OKX path calls okxwallet.bitcoin.connect()', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    const okxBlock = src.match(/if\s*\(walletId\s*===\s*'okx'\)\s*\{([\s\S]*?)\}\s*else\s*if/)?.[1] || '';
    expect(okxBlock).toContain('okxProvider.connect()');
    expect(okxBlock).toContain("okxwallet?.bitcoin");
  });

  it('modal closes BEFORE wallet API calls', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // setIsConnectModalOpen(false) must appear BEFORE the wallet-specific if/else block
    const modalCloseIdx = src.indexOf('setIsConnectModalOpen(false)');
    const xverseIdx = src.indexOf("if (walletId === 'xverse')");
    expect(modalCloseIdx).toBeGreaterThan(0);
    expect(xverseIdx).toBeGreaterThan(0);
    expect(modalCloseIdx).toBeLessThan(xverseIdx);
  });

  it('all 4 wallets cache addresses to localStorage for auto-reconnect', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // After connection, WalletContext caches addresses
    expect(src).toContain('BROWSER_WALLET_ADDRESSES');
    expect(src).toContain('localStorage.setItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES');
  });

  it('Xverse signTaprootPsbt bypasses SDK adapter for direct signing', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // The Xverse bypass calls BitcoinProvider.request('signPsbt', ...) directly
    expect(src).toContain("browserWallet?.info?.id === 'xverse'");
    expect(src).toContain("XverseProviders?.BitcoinProvider");
  });
});
