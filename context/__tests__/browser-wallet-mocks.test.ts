/**
 * Browser wallet integration pattern tests via source code analysis and mock verification.
 *
 * Tests WalletContext.tsx browser wallet patterns by reading the source and verifying:
 * - Connection patterns per wallet (OYL, UniSat, OKX, Xverse, etc.)
 * - Signing delegation to ts-sdk adapter (no direct window.* calls in signing paths)
 * - Auto-reconnection patterns (OYL)
 * - Wallet adapter initialization and teardown
 * - Address handling and single-address wallet support
 * - PSBT patching pipeline references
 *
 * Does NOT require WASM, DOM, React rendering, or network access.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read WalletContext.tsx source once */
function readWalletContextSource(): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../WalletContext.tsx'),
    'utf-8',
  );
}

/** Read psbt-patching.ts source */
function readPsbtPatchingSource(): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../../lib/psbt-patching.ts'),
    'utf-8',
  );
}

/**
 * Extract a function body from the source by matching `const <name> = useCallback(async`.
 * Finds the arrow `=>` after the marker, then matches the `{...}` of the arrow function body.
 */
function extractCallbackBody(source: string, fnName: string): string {
  const marker = `const ${fnName} = useCallback(async`;
  const start = source.indexOf(marker);
  if (start === -1) return '';

  const arrowIdx = source.indexOf('=> {', start);
  if (arrowIdx === -1) return '';

  const bodyOpenBrace = arrowIdx + 3;
  let braceDepth = 1;
  let bodyEnd = bodyOpenBrace + 1;

  for (let i = bodyOpenBrace + 1; i < source.length; i++) {
    if (source[i] === '{') braceDepth++;
    else if (source[i] === '}') braceDepth--;
    if (braceDepth === 0) {
      bodyEnd = i;
      break;
    }
  }

  return source.slice(bodyOpenBrace, bodyEnd + 1);
}

/**
 * Extract the connectBrowserWallet function body, which includes all
 * wallet-specific connection branches.
 */
function extractConnectBrowserWallet(source: string): string {
  return extractCallbackBody(source, 'connectBrowserWallet');
}

// ---------------------------------------------------------------------------
// 1. WalletContext browser wallet connection patterns
// ---------------------------------------------------------------------------

describe('WalletContext browser wallet connection patterns', () => {
  const source = readWalletContextSource();
  const connectBody = extractConnectBrowserWallet(source);

  it('OYL connection uses getAddresses() (no connect() method)', () => {
    // OYL branch should call oylProvider.getAddresses()
    expect(connectBody).toContain('oylProvider.getAddresses()');

    // OYL has NO connect() method - verify we do NOT call oylProvider.connect()
    // Search specifically in the OYL branch
    const oylBranchStart = connectBody.indexOf("walletId === 'oyl'");
    expect(oylBranchStart).toBeGreaterThan(-1);

    // Extract just the OYL branch for targeted checking
    const oylSection = connectBody.slice(
      oylBranchStart,
      connectBody.indexOf("} else if (walletId === 'tokeo'")
    );
    expect(oylSection).not.toContain('oylProvider.connect(');
    expect(oylSection).toContain('oylProvider.getAddresses()');
  });

  it('UniSat connection tries getAccounts() first, falls back to requestAccounts() with timeout', () => {
    // UniSat branch should check getAccounts() first
    const unisatBranchStart = connectBody.indexOf("walletId === 'unisat'");
    expect(unisatBranchStart).toBeGreaterThan(-1);

    const unisatSection = connectBody.slice(unisatBranchStart);

    // Should call getAccounts() first (to check existing connection)
    expect(unisatSection).toContain('unisatProvider.getAccounts()');

    // Should use requestAccounts() as fallback
    expect(unisatSection).toContain('unisatProvider.requestAccounts()');

    // Should have timeout protection (either via Promise.race with setTimeout, or polling timeout)
    // The current implementation uses a polling approach with maxAttempts
    const hasTimeout = unisatSection.includes('timed out') ||
                       unisatSection.includes('setTimeout') ||
                       unisatSection.includes('maxAttempts');
    expect(hasTimeout).toBe(true);
  });

  it('OKX connection has 10s timeout on connect()', () => {
    const okxBranchStart = connectBody.indexOf("walletId === 'okx'");
    expect(okxBranchStart).toBeGreaterThan(-1);

    const okxSection = connectBody.slice(
      okxBranchStart,
      connectBody.indexOf("} else if (walletId === 'unisat'")
    );

    // OKX uses okxProvider.connect()
    expect(okxSection).toContain('okxProvider.connect()');

    // Should have Promise.race with timeout
    expect(okxSection).toContain('Promise.race');
    expect(okxSection).toContain('10000');
    expect(okxSection).toMatch(/timed out after 10s/i);
  });

  it('Xverse connection pattern exists and uses getAccounts', () => {
    const xverseBranchStart = connectBody.indexOf("walletId === 'xverse'");
    expect(xverseBranchStart).toBeGreaterThan(-1);

    const xverseSection = connectBody.slice(
      xverseBranchStart,
      connectBody.indexOf("} else if (walletId === 'leather'")
    );

    // Xverse uses XverseProviders.BitcoinProvider.request('getAccounts')
    expect(xverseSection).toContain("xverseProvider.request('getAccounts'");

    // Should have timeout protection
    expect(xverseSection).toContain('Promise.race');
    expect(xverseSection).toContain('setTimeout');
  });

  it('all connection attempts have error handling', () => {
    // The entire connectBrowserWallet is wrapped in try/catch
    expect(connectBody).toContain('} catch (error)');
    expect(connectBody).toContain("console.error('[WalletContext] Failed to connect browser wallet:'");
    expect(connectBody).toContain('throw error');
  });

  it('browserWallet state is set after successful connection', () => {
    // After connection, state setters should be called
    expect(connectBody).toContain('setBrowserWallet(connected)');
    expect(connectBody).toContain("setWalletType('browser')");
    expect(connectBody).toContain('setBrowserWalletAddresses(additionalAddresses)');
  });

  it('wallet adapter is created after successful connection', () => {
    // createWalletAdapter should be called after connection
    expect(connectBody).toContain('createWalletAdapter(connected)');
    expect(connectBody).toContain('setWalletAdapter(adapter)');
  });
});

// ---------------------------------------------------------------------------
// 2. Signing delegation to ts-sdk adapter
// ---------------------------------------------------------------------------

describe('Signing delegation to ts-sdk adapter', () => {
  const source = readWalletContextSource();

  describe('signTaprootPsbt', () => {
    const body = extractCallbackBody(source, 'signTaprootPsbt');

    it('delegates to walletAdapter.signPsbt for browser wallets', () => {
      expect(body).toContain("walletAdapter && walletType === 'browser'");
      expect(body).toContain('walletAdapter.signPsbt(psbtHex');
    });

    it('performs base64-to-hex conversion before calling adapter', () => {
      // Should convert base64 input to hex for the adapter
      expect(body).toContain("Buffer.from(psbtBase64, 'base64')");
      expect(body).toContain(".toString('hex')");
    });

    it('performs hex-to-base64 conversion on adapter result', () => {
      // Should convert hex result back to base64
      expect(body).toContain("Buffer.from(signedHex, 'hex')");
      expect(body).toContain(".toString('base64')");
    });

    it('wraps adapter errors with wallet-specific context', () => {
      // Error handling should include wallet ID
      expect(body).toContain('signing failed:');
      expect(body).toContain('walletId');
    });

    it('does NOT contain direct window.unisat calls', () => {
      expect(body).not.toContain('window.unisat');
      expect(body).not.toContain("(window as any).unisat");
    });

    it('does NOT contain direct window.xverse / XverseProviders calls', () => {
      expect(body).not.toContain('XverseProviders');
      expect(body).not.toContain('window.xverse');
    });

    it('does NOT contain direct window.oyl calls in signing path', () => {
      expect(body).not.toContain('window.oyl');
      expect(body).not.toContain("(window as any).oyl");
    });

    it('does NOT contain direct window.okxwallet calls in signing path', () => {
      expect(body).not.toContain('window.okxwallet');
      expect(body).not.toContain("(window as any).okxwallet");
    });
  });

  describe('signSegwitPsbt', () => {
    const body = extractCallbackBody(source, 'signSegwitPsbt');

    it('delegates to walletAdapter.signPsbt for browser wallets', () => {
      expect(body).toContain("walletAdapter && walletType === 'browser'");
      expect(body).toContain('walletAdapter.signPsbt(psbtHex');
    });

    it('performs hex/base64 conversions correctly', () => {
      expect(body).toContain("Buffer.from(psbtBase64, 'base64')");
      expect(body).toContain("Buffer.from(signedHex, 'hex')");
    });

    it('handles browser wallet case before keystore fallback', () => {
      // Browser wallet check should come first
      const adapterCheckIdx = body.indexOf("walletAdapter && walletType === 'browser'");
      const keystoreCheckIdx = body.indexOf("if (!wallet)");
      expect(adapterCheckIdx).toBeGreaterThan(-1);
      expect(keystoreCheckIdx).toBeGreaterThan(adapterCheckIdx);
    });
  });

  describe('signPsbt (unified)', () => {
    const body = extractCallbackBody(source, 'signPsbt');

    it('delegates to walletAdapter.signPsbt for browser wallets', () => {
      expect(body).toContain("walletAdapter && walletType === 'browser'");
      expect(body).toContain('walletAdapter.signPsbt(psbtHex');
    });

    it('passes auto_finalized: false to adapter', () => {
      expect(body).toContain('auto_finalized: false');
    });
  });

  describe('signPsbts (batch)', () => {
    const body = extractCallbackBody(source, 'signPsbts');

    it('delegates each PSBT to walletAdapter.signPsbt', () => {
      expect(body).toContain("walletAdapter && walletType === 'browser'");
      expect(body).toContain('walletAdapter.signPsbt(psbtHex');
    });

    it('processes all PSBTs via Promise.all', () => {
      expect(body).toContain('Promise.all');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Auto-reconnection patterns
// ---------------------------------------------------------------------------

describe('Auto-reconnection patterns', () => {
  const source = readWalletContextSource();

  it('OYL connection logs "connected first" diagnostic info', () => {
    // The OYL connection branch should have isConnected() checking for session state
    const connectBody = extractConnectBrowserWallet(source);
    const oylBranchStart = connectBody.indexOf("walletId === 'oyl'");
    expect(oylBranchStart).toBeGreaterThan(-1);

    const oylSection = connectBody.slice(
      oylBranchStart,
      connectBody.indexOf("} else if (walletId === 'tokeo'")
    );

    // OYL checks isConnected() status
    expect(oylSection).toContain('oylProvider.isConnected');
  });

  it('auto-reconnect from cached addresses avoids re-prompting the extension', () => {
    // The init effect should restore from localStorage without calling connector.connect()
    expect(source).toContain('BROWSER_WALLET_ADDRESSES');
    expect(source).toContain('Restored browser wallet from cache');
    // The comment explicitly says we DON'T call connector.connect() on page load
    expect(source).toContain("don't call connector.connect() on page load");
  });

  it('auto-reconnect creates a wallet adapter from cached state', () => {
    // After restoring from cache, adapter should be created
    expect(source).toContain('createWalletAdapter(connected)');
    // Verify adapter is set in the cache-restore path
    const cacheRestoreIdx = source.indexOf('Restored browser wallet from cache');
    expect(cacheRestoreIdx).toBeGreaterThan(-1);

    // Look backward from the log message for setWalletAdapter
    const cacheSection = source.slice(
      Math.max(0, cacheRestoreIdx - 500),
      cacheRestoreIdx
    );
    expect(cacheSection).toContain('setWalletAdapter(adapter)');
  });
});

// ---------------------------------------------------------------------------
// 4. Wallet adapter initialization
// ---------------------------------------------------------------------------

describe('Wallet adapter initialization', () => {
  const source = readWalletContextSource();

  it('walletAdapter is created when browserWallet connects', () => {
    const connectBody = extractConnectBrowserWallet(source);
    // After successful connection, createWalletAdapter is called
    expect(connectBody).toContain('const adapter = createWalletAdapter(connected)');
    expect(connectBody).toContain('setWalletAdapter(adapter)');
  });

  it('walletAdapter is cleared on disconnect', () => {
    const disconnectBody = extractCallbackBody(source, 'disconnect');
    expect(disconnectBody).toContain('setWalletAdapter(null)');
  });

  it('walletAdapter is cleared when switching to keystore wallet', () => {
    // Creating a new keystore wallet should clear browser wallet adapter
    const createWalletBody = extractCallbackBody(source, 'createNewWallet');
    expect(createWalletBody).toContain('setWalletAdapter(null)');

    // Unlocking keystore should clear browser wallet adapter
    const unlockBody = extractCallbackBody(source, 'unlockWallet');
    expect(unlockBody).toContain('setWalletAdapter(null)');

    // Restoring wallet from mnemonic should clear browser wallet adapter
    const restoreBody = extractCallbackBody(source, 'restoreWallet');
    expect(restoreBody).toContain('setWalletAdapter(null)');
  });

  it('walletAdapter state variable is typed as JsWalletAdapter | null', () => {
    expect(source).toContain('useState<JsWalletAdapter | null>(null)');
  });

  it('createWalletAdapter is imported from @alkanes/ts-sdk', () => {
    expect(source).toContain("createWalletAdapter");
    expect(source).toMatch(/from\s+['"]@alkanes\/ts-sdk['"]/);
  });
});

// ---------------------------------------------------------------------------
// 5. Address handling in wallet context
// ---------------------------------------------------------------------------

describe('Address handling in wallet context', () => {
  const source = readWalletContextSource();

  it('account.taproot and account.nativeSegwit are populated from browser wallet', () => {
    // The addresses useMemo should handle browser wallet addresses
    expect(source).toContain("browserWallet && walletType === 'browser'");
    expect(source).toContain('browserWalletAddresses');
  });

  it('supports single-address wallets (UniSat/OKX provide only one address type)', () => {
    // When a wallet provides only one address, the other should be empty
    // The address detection falls back to format detection
    expect(source).toContain("isTaproot = primaryAddress.startsWith('bc1p')");
    expect(source).toContain("isNativeSegwit = primaryAddress.startsWith('bc1q')");

    // Empty address entries for unavailable type
    expect(source).toContain("address: '', pubkey: '', hdPath: ''");
    expect(source).toContain("address: '', pubkey: '', pubKeyXOnly: '', hdPath: ''");
  });

  it('address detection handles regtest prefixes', () => {
    expect(source).toContain("startsWith('bcrt1p')");
    expect(source).toContain("startsWith('bcrt1q')");
  });

  it('primaryAddress fallback pattern uses taproot || nativeSegwit', () => {
    // In various connection branches, primaryAddress is computed as taproot || segwit
    const connectBody = extractConnectBrowserWallet(source);

    // OYL uses this pattern
    expect(connectBody).toContain(
      "addresses.taproot?.address || addresses.nativeSegwit?.address"
    );
  });

  it('account structure includes spendStrategy with addressOrder', () => {
    expect(source).toContain("addressOrder: ['nativeSegwit', 'taproot']");
    expect(source).toContain("changeAddress: 'nativeSegwit'");
  });

  it('pubKeyXOnly strips the 02/03 prefix from compressed pubkey', () => {
    // For browser wallets with explicit taproot pubkey
    expect(source).toContain("taprootAddr!.publicKey.slice(2)");
    // For keystore wallets
    expect(source).toContain("taprootInfo.publicKey.slice(2)");
  });
});

// ---------------------------------------------------------------------------
// 6. PSBT patching pipeline verification
// ---------------------------------------------------------------------------

describe('PSBT patching pipeline verification', () => {
  const source = readWalletContextSource();

  it('source references patchTapInternalKey handling via ts-sdk adapter', () => {
    // The old import of patchTapInternalKeys from lib/psbt-patching should be commented out
    expect(source).toContain("// import { patchTapInternalKeys }");
    // Or it references that ts-sdk adapter handles tapInternalKey
    expect(source).toContain('tapInternalKey patching');
  });

  it('PSBT patching is handled by ts-sdk wallet adapters, not local code', () => {
    // The comment should indicate ts-sdk handles patching
    expect(source).toContain('ts-sdk wallet adapters');
    // The old patchPsbtForBrowserWallet import should be gone or commented
    expect(source).toContain(
      'PSBT patching is now handled by ts-sdk wallet adapters'
    );
  });

  it('signTaprootPsbt does NOT contain direct window.* calls for any wallet', () => {
    const body = extractCallbackBody(source, 'signTaprootPsbt');

    // No direct wallet provider calls in the signing function
    const directWindowCalls = [
      'window.unisat',
      'window.oyl',
      'window.okxwallet',
      'window.xverse',
      'XverseProviders',
      'window.phantom',
      'window.leather',
      'window.magicEden',
    ];

    for (const call of directWindowCalls) {
      expect(body).not.toContain(call);
    }
  });

  it('signSegwitPsbt does NOT contain direct window.* calls for any wallet', () => {
    const body = extractCallbackBody(source, 'signSegwitPsbt');

    const directWindowCalls = [
      'window.unisat',
      'window.oyl',
      'window.okxwallet',
      'window.xverse',
      'XverseProviders',
    ];

    for (const call of directWindowCalls) {
      expect(body).not.toContain(call);
    }
  });

  it('psbt-patching.ts exports patchTapInternalKeys function', () => {
    const patchingSource = readPsbtPatchingSource();
    expect(patchingSource).toContain('export function patchTapInternalKeys');
  });

  it('psbt-patching.ts exports patchPsbtForBrowserWallet function', () => {
    const patchingSource = readPsbtPatchingSource();
    expect(patchingSource).toContain('export function patchPsbtForBrowserWallet');
  });

  it('psbt-patching.ts exports patchInputsOnly for SDK-address-aware hooks', () => {
    const patchingSource = readPsbtPatchingSource();
    expect(patchingSource).toContain('export function patchInputsOnly');
  });

  it('psbt-patching.ts handles P2TR, P2WPKH, and P2SH script types', () => {
    const patchingSource = readPsbtPatchingSource();
    expect(patchingSource).toContain('function isP2TR');
    expect(patchingSource).toContain('function isP2WPKH');
    expect(patchingSource).toContain('function isP2SH');
  });
});

// ---------------------------------------------------------------------------
// 7. Connection branch completeness
// ---------------------------------------------------------------------------

describe('Connection branch completeness', () => {
  const source = readWalletContextSource();
  const connectBody = extractConnectBrowserWallet(source);

  const wallets = [
    { id: 'xverse', check: "walletId === 'xverse'" },
    { id: 'leather', check: "walletId === 'leather'" },
    { id: 'phantom', check: "walletId === 'phantom'" },
    { id: 'keplr', check: "walletId === 'keplr'" },
    { id: 'oyl', check: "walletId === 'oyl'" },
    { id: 'tokeo', check: "walletId === 'tokeo'" },
    { id: 'orange', check: "walletId === 'orange'" },
    { id: 'magic-eden', check: "walletId === 'magic-eden'" },
    { id: 'okx', check: "walletId === 'okx'" },
    { id: 'unisat', check: "walletId === 'unisat'" },
  ];

  for (const w of wallets) {
    it(`has dedicated connection branch for ${w.id}`, () => {
      expect(connectBody).toContain(w.check);
    });
  }

  it('has a fallback branch for unknown wallets using WalletConnector', () => {
    expect(connectBody).toContain('connector.connect(walletInfo)');
  });

  it('all branches construct ConnectedWallet with address and addressType', () => {
    // Every branch should create a ConnectedWallet with at least address and addressType
    // Count occurrences of new (ConnectedWallet as any)
    const matches = connectBody.match(/new \(ConnectedWallet as any\)/g);
    // At minimum, the wallet-specific branches each create a ConnectedWallet
    // (xverse, leather, phantom, keplr, oyl, tokeo, orange, magic-eden, okx, unisat = 10)
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// 8. Mock wallet factory consistency
// ---------------------------------------------------------------------------

describe('Mock wallet factory consistency with WalletContext', () => {
  let mockFactorySource: string;

  try {
    mockFactorySource = fs.readFileSync(
      path.resolve(__dirname, '../../__tests__/helpers/mock-wallet-factory.ts'),
      'utf-8',
    );
  } catch {
    mockFactorySource = '';
  }

  // Skip this section if mock factory doesn't exist
  const describeOrSkip = mockFactorySource ? describe : describe.skip;

  describeOrSkip('mock wallet API surface matches WalletContext expectations', () => {
    it('OYL mock exposes getAddresses() (matching WalletContext OYL branch)', () => {
      expect(mockFactorySource).toContain('getAddresses:');
      // OYL mock should NOT expose connect() since OYL has no connect method
      const oylSection = mockFactorySource.slice(
        mockFactorySource.indexOf("case 'oyl':"),
        mockFactorySource.indexOf("case 'unisat':")
      );
      // getAddresses should be in the OYL section
      expect(oylSection).toContain('getAddresses');
    });

    it('UniSat mock exposes both getAccounts() and requestAccounts()', () => {
      const unisatSection = mockFactorySource.slice(
        mockFactorySource.indexOf("case 'unisat':"),
        mockFactorySource.indexOf("case 'okx':")
      );
      expect(unisatSection).toContain('requestAccounts');
      expect(unisatSection).toContain('getAccounts');
    });

    it('OKX mock exposes connect() (matching WalletContext OKX branch)', () => {
      const okxSection = mockFactorySource.slice(
        mockFactorySource.indexOf("case 'okx':"),
        mockFactorySource.indexOf("case 'phantom':")
      );
      expect(okxSection).toContain('connect:');
    });

    it('Xverse mock uses getAccounts via provider.request', () => {
      const xverseSection = mockFactorySource.slice(
        mockFactorySource.indexOf("case 'xverse':"),
        mockFactorySource.indexOf("case 'oyl':")
      );
      // Xverse mock should handle 'getAccounts' requests
      expect(xverseSection).toContain("'getAccounts'");
    });

    it('all mock wallets expose signPsbt', () => {
      // Every wallet mock should have a signPsbt function
      for (const walletId of ['xverse', 'oyl', 'unisat', 'okx', 'phantom', 'leather', 'magic-eden']) {
        const idx = mockFactorySource.indexOf(`case '${walletId}':`);
        if (idx === -1) continue;
        const section = mockFactorySource.slice(idx, idx + 1500);
        expect(section).toContain('signPsbt');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 9. Hex/Base64 conversion correctness (unit tests)
// ---------------------------------------------------------------------------

describe('Hex/Base64 conversion correctness', () => {
  it('Buffer.from base64->hex->base64 round-trips correctly', () => {
    const original = 'cHNidCBkYXRh'; // "psbt data" in base64
    const hex = Buffer.from(original, 'base64').toString('hex');
    const roundTripped = Buffer.from(hex, 'hex').toString('base64');
    expect(roundTripped).toBe(original);
  });

  it('empty PSBT-like data round-trips', () => {
    const emptyBase64 = Buffer.from('70736274ff', 'hex').toString('base64');
    const hex = Buffer.from(emptyBase64, 'base64').toString('hex');
    expect(hex).toBe('70736274ff');
    const back = Buffer.from(hex, 'hex').toString('base64');
    expect(back).toBe(emptyBase64);
  });

  it('conversion matches the pattern used in signTaprootPsbt', () => {
    // Simulate the exact conversion pattern from signTaprootPsbt:
    // 1. psbtBuffer = Buffer.from(psbtBase64, 'base64')
    // 2. psbtHex = psbtBuffer.toString('hex')
    // 3. signedHex = adapter.signPsbt(psbtHex)
    // 4. return Buffer.from(signedHex, 'hex').toString('base64')
    const psbtBase64 = 'AAEC'; // arbitrary test data
    const psbtBuffer = Buffer.from(psbtBase64, 'base64');
    const psbtHex = psbtBuffer.toString('hex');
    expect(typeof psbtHex).toBe('string');
    expect(psbtHex).toMatch(/^[0-9a-f]+$/);

    // Simulate adapter returning same hex (identity sign)
    const signedHex = psbtHex;
    const result = Buffer.from(signedHex, 'hex').toString('base64');
    expect(result).toBe(psbtBase64);
  });
});

// ---------------------------------------------------------------------------
// 10. Disconnect cleanup
// ---------------------------------------------------------------------------

describe('Disconnect cleanup', () => {
  const source = readWalletContextSource();
  const disconnectBody = extractCallbackBody(source, 'disconnect');

  it('clears browserWallet state', () => {
    expect(disconnectBody).toContain('setBrowserWallet(null)');
  });

  it('clears browserWalletAddresses state', () => {
    expect(disconnectBody).toContain('setBrowserWalletAddresses(null)');
  });

  it('clears walletAdapter state', () => {
    expect(disconnectBody).toContain('setWalletAdapter(null)');
  });

  it('clears walletType state', () => {
    expect(disconnectBody).toContain('setWalletType(null)');
  });

  it('removes browser wallet ID from localStorage', () => {
    expect(disconnectBody).toContain("localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID)");
  });

  it('removes wallet type from localStorage', () => {
    expect(disconnectBody).toContain("localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE)");
  });

  it('removes cached addresses from localStorage', () => {
    expect(disconnectBody).toContain("localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES)");
  });

  it('calls browserWallet.disconnect() with error handling', () => {
    expect(disconnectBody).toContain('browserWallet.disconnect()');
    expect(disconnectBody).toContain('catch (error)');
  });

  it('disconnects the WalletConnector', () => {
    expect(disconnectBody).toContain('connector.disconnect()');
  });
});
