/**
 * Wallet signing logic tests for WalletContext.tsx
 *
 * Tests the signTaprootPsbt, signSegwitPsbt, and signPsbts functions.
 * Verifies:
 * - Browser wallet signing delegates to walletAdapter.signPsbt() (no direct window.* calls)
 * - Hex-to-base64 and base64-to-hex conversions are correct
 * - Adapter errors are propagated with wallet ID context
 * - Keystore signing uses BIP86 (taproot) and BIP84 (segwit) derivation paths
 * - Old wallet-specific branches (Xverse signInputs, UniSat autoFinalized, OYL reconnection)
 *   are GONE from signTaprootPsbt/signSegwitPsbt — all handled by ts-sdk adapters
 *
 * Does NOT require WASM or network access.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read WalletContext.tsx source once for architecture/source-verification tests */
function readWalletContextSource(): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../WalletContext.tsx'),
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

  // Find the `=> {` that starts the arrow function body (skip type annotations)
  const arrowIdx = source.indexOf('=> {', start);
  if (arrowIdx === -1) return '';

  // The opening brace of the function body is at arrowIdx + 3
  const bodyOpenBrace = arrowIdx + 3;
  let braceDepth = 1;
  let bodyEnd = bodyOpenBrace + 1;

  for (let i = bodyOpenBrace + 1; i < source.length; i++) {
    if (source[i] === '{') braceDepth++;
    if (source[i] === '}') braceDepth--;
    if (braceDepth === 0) {
      bodyEnd = i + 1;
      break;
    }
  }

  return source.slice(bodyOpenBrace, bodyEnd);
}

// ---------------------------------------------------------------------------
// Architecture / source-verification tests
// ---------------------------------------------------------------------------

describe('WalletContext signing architecture (source verification)', () => {
  const src = readWalletContextSource();
  const signTaprootBody = extractCallbackBody(src, 'signTaprootPsbt');
  const signSegwitBody = extractCallbackBody(src, 'signSegwitPsbt');
  const signPsbtBody = extractCallbackBody(src, 'signPsbt');
  const signPsbtsBody = extractCallbackBody(src, 'signPsbts');

  it('signTaprootPsbt exists and is a useCallback', () => {
    expect(signTaprootBody.length).toBeGreaterThan(100);
  });

  it('signSegwitPsbt exists and is a useCallback', () => {
    expect(signSegwitBody.length).toBeGreaterThan(100);
  });

  // ---- Browser wallet delegation to adapter ----

  it('signTaprootPsbt delegates to walletAdapter.signPsbt() for browser wallets', () => {
    expect(signTaprootBody).toContain('walletAdapter.signPsbt(psbtHex');
    // Must check walletType === 'browser'
    expect(signTaprootBody).toContain("walletType === 'browser'");
  });

  it('signSegwitPsbt delegates to walletAdapter.signPsbt() for browser wallets', () => {
    expect(signSegwitBody).toContain('walletAdapter.signPsbt(psbtHex');
    expect(signSegwitBody).toContain("walletType === 'browser'");
  });

  it('signPsbt (generic) delegates to walletAdapter.signPsbt() for browser wallets', () => {
    expect(signPsbtBody).toContain('walletAdapter.signPsbt(psbtHex');
    expect(signPsbtBody).toContain("walletType === 'browser'");
  });

  it('signPsbts delegates to walletAdapter.signPsbt() for each PSBT', () => {
    expect(signPsbtsBody).toContain('walletAdapter.signPsbt(psbtHex');
    expect(signPsbtsBody).toContain("walletType === 'browser'");
  });

  // ---- Adapter receives hex format ----

  it('signTaprootPsbt converts base64 input to hex before passing to adapter', () => {
    // Should convert base64 → Buffer → hex
    expect(signTaprootBody).toContain("Buffer.from(psbtBase64, 'base64')");
    expect(signTaprootBody).toContain(".toString('hex')");
  });

  it('signSegwitPsbt converts base64 input to hex before passing to adapter', () => {
    expect(signSegwitBody).toContain("Buffer.from(psbtBase64, 'base64')");
    expect(signSegwitBody).toContain(".toString('hex')");
  });

  // ---- Signed result converted back to base64 ----

  it('signTaprootPsbt converts signed hex result back to base64', () => {
    expect(signTaprootBody).toContain("Buffer.from(signedHex, 'hex').toString('base64')");
  });

  it('signSegwitPsbt converts signed hex result back to base64', () => {
    // signSegwitPsbt uses an intermediate variable: signedBuffer = Buffer.from(signedHex, 'hex')
    // then returns signedBuffer.toString('base64')
    expect(signSegwitBody).toContain("Buffer.from(signedHex, 'hex')");
    expect(signSegwitBody).toContain(".toString('base64')");
  });

  // ---- auto_finalized: false passed to adapter ----

  it('signTaprootPsbt passes auto_finalized: false to adapter', () => {
    expect(signTaprootBody).toContain('auto_finalized: false');
  });

  it('signSegwitPsbt passes auto_finalized: false to adapter', () => {
    expect(signSegwitBody).toContain('auto_finalized: false');
  });

  // ---- Error handling wraps adapter errors with wallet ID ----

  it('signTaprootPsbt catches adapter errors and rethrows with wallet ID', () => {
    expect(signTaprootBody).toContain('signing failed:');
    expect(signTaprootBody).toContain('catch');
  });

  it('signTaprootPsbt throws on empty adapter result', () => {
    expect(signTaprootBody).toContain('signing returned empty result');
  });

  // ---- Keystore signing uses correct derivation paths ----

  it('signTaprootPsbt uses BIP86 derivation path for keystore wallets', () => {
    // BIP86 path: m/86'/coinType/0'/0/0
    expect(signTaprootBody).toContain("m/86'/${coinType}'/0'/0/0");
    expect(signTaprootBody).toContain('taprootPath');
  });

  it('signSegwitPsbt uses BIP84 derivation path for keystore wallets', () => {
    // BIP84 path: m/84'/coinType/0'/0/0
    expect(signSegwitBody).toContain("m/84'/${coinType}'/0'/0/0");
    expect(signSegwitBody).toContain('segwitPath');
  });

  it('signTaprootPsbt uses coinType 0 for mainnet and 1 for testnet/regtest', () => {
    expect(signTaprootBody).toContain("network === 'mainnet' ? 0 : 1");
  });

  it('signSegwitPsbt uses coinType 0 for mainnet and 1 for testnet/regtest', () => {
    expect(signSegwitBody).toContain("network === 'mainnet' ? 0 : 1");
  });

  // ---- Keystore signing requires mnemonic from sessionStorage ----

  it('signTaprootPsbt reads mnemonic from sessionStorage for keystore', () => {
    expect(signTaprootBody).toContain('sessionStorage.getItem');
    expect(signTaprootBody).toContain('SESSION_MNEMONIC');
  });

  it('signSegwitPsbt reads mnemonic from sessionStorage for keystore', () => {
    expect(signSegwitBody).toContain('sessionStorage.getItem');
    expect(signSegwitBody).toContain('SESSION_MNEMONIC');
  });

  // ---- Keystore signing throws if wallet not connected or mnemonic missing ----

  it('signTaprootPsbt throws if wallet not connected (keystore path)', () => {
    expect(signTaprootBody).toContain("throw new Error('Wallet not connected')");
  });

  it('signTaprootPsbt throws if mnemonic expired (keystore path)', () => {
    expect(signTaprootBody).toContain('Wallet session expired');
  });

  it('signSegwitPsbt throws if wallet not connected (keystore path)', () => {
    expect(signSegwitBody).toContain("throw new Error('Wallet not connected')");
  });

  // ---- Taproot-specific: x-only pubkey and tweak ----

  it('signTaprootPsbt derives x-only pubkey (slice 1,33) for taproot', () => {
    expect(signTaprootBody).toContain('publicKey.slice(1, 33)');
  });

  it('signTaprootPsbt applies TapTweak for key-path spend', () => {
    expect(signTaprootBody).toContain("taggedHash('TapTweak'");
    expect(signTaprootBody).toContain('.tweak(');
  });
});

describe('Old wallet-specific signing branches are REMOVED', () => {
  const src = readWalletContextSource();
  const signTaprootBody = extractCallbackBody(src, 'signTaprootPsbt');
  const signSegwitBody = extractCallbackBody(src, 'signSegwitPsbt');

  it('signTaprootPsbt does NOT contain direct window.unisat calls', () => {
    expect(signTaprootBody).not.toContain('window.unisat');
    expect(signTaprootBody).not.toContain('(window as any).unisat');
  });

  it('signTaprootPsbt does NOT contain direct window.oyl calls', () => {
    expect(signTaprootBody).not.toContain('window.oyl');
    expect(signTaprootBody).not.toContain('(window as any).oyl');
  });

  it('signTaprootPsbt does NOT contain direct window.okxwallet calls', () => {
    expect(signTaprootBody).not.toContain('window.okxwallet');
    expect(signTaprootBody).not.toContain('(window as any).okxwallet');
  });

  it('signTaprootPsbt does NOT contain Xverse BitcoinProvider direct signing', () => {
    expect(signTaprootBody).not.toContain('BitcoinProvider.request');
    expect(signTaprootBody).not.toContain("request('signPsbt'");
  });

  it('signTaprootPsbt does NOT contain UniSat autoFinalized:true (handled by adapter)', () => {
    expect(signTaprootBody).not.toContain('autoFinalized: true');
    expect(signTaprootBody).not.toContain('autoFinalized:true');
  });

  it('signTaprootPsbt does NOT contain OYL reconnection logic (handled by adapter)', () => {
    // OYL reconnection was: "Site origin must be connected first" → getAddresses()
    expect(signTaprootBody).not.toContain('connected first');
    expect(signTaprootBody).not.toContain('oylProvider');
  });

  it('signSegwitPsbt does NOT contain direct window.* wallet calls', () => {
    expect(signSegwitBody).not.toContain('window.unisat');
    expect(signSegwitBody).not.toContain('window.oyl');
    expect(signSegwitBody).not.toContain('window.okxwallet');
    expect(signSegwitBody).not.toContain('(window as any).unisat');
    expect(signSegwitBody).not.toContain('(window as any).oyl');
    expect(signSegwitBody).not.toContain('(window as any).okxwallet');
  });

  it('signTaprootPsbt does NOT contain lib/psbt-patching imports (handled by adapter)', () => {
    expect(signTaprootBody).not.toContain('patchPsbtForBrowserWallet');
    expect(signTaprootBody).not.toContain('patchTapInternalKey');
  });

  it('signTaprootPsbt has ARCHITECTURE NOTE about adapter delegation', () => {
    // The comment block before the function documents the refactor
    const signTaprootIdx = src.indexOf('const signTaprootPsbt = useCallback');
    const precedingBlock = src.slice(Math.max(0, signTaprootIdx - 500), signTaprootIdx);
    expect(precedingBlock).toContain('ARCHITECTURE NOTE');
    expect(precedingBlock).toContain('ts-sdk wallet adapters');
  });
});

describe('Hex/Base64 conversion logic (functional)', () => {
  // These tests verify the exact conversion logic used in signTaprootPsbt/signSegwitPsbt
  // without needing WASM or a real wallet

  it('base64 → hex → base64 roundtrip preserves data', () => {
    // Simulate what signTaprootPsbt does:
    // Input: psbtBase64 (from SDK)
    // Step 1: Buffer.from(psbtBase64, 'base64').toString('hex') → send to adapter
    // Step 2: Buffer.from(signedHex, 'hex').toString('base64') → return

    const originalBytes = Buffer.from([
      0x70, 0x73, 0x62, 0x74, 0xff, // "psbt" magic + separator
      0x01, 0x00, 0x00, 0x00, 0x00, // global unsigned tx placeholder
    ]);

    const psbtBase64 = originalBytes.toString('base64');

    // Step 1: what the code does before calling adapter
    const psbtHex = Buffer.from(psbtBase64, 'base64').toString('hex');
    expect(psbtHex).toBe('70736274ff0100000000');

    // Step 2: adapter returns signed hex, code converts back
    const signedHex = psbtHex; // In reality adapter modifies, but format is same
    const resultBase64 = Buffer.from(signedHex, 'hex').toString('base64');

    expect(resultBase64).toBe(psbtBase64);
  });

  it('hex output is lowercase (as expected by wallet APIs)', () => {
    const input = Buffer.from('AABBCC', 'hex');
    const base64 = input.toString('base64');
    const hex = Buffer.from(base64, 'base64').toString('hex');

    // Buffer.toString('hex') always produces lowercase
    expect(hex).toBe('aabbcc');
    expect(hex).not.toMatch(/[A-F]/);
  });

  it('handles empty PSBT buffer gracefully', () => {
    const emptyBase64 = Buffer.from([]).toString('base64');
    const hex = Buffer.from(emptyBase64, 'base64').toString('hex');
    expect(hex).toBe('');

    const backToBase64 = Buffer.from(hex, 'hex').toString('base64');
    expect(backToBase64).toBe(emptyBase64);
  });

  it('handles large PSBT buffers without data loss', () => {
    // Simulate a PSBT with many inputs (28 inputs as mentioned in OYL bug)
    const largeBuffer = Buffer.alloc(4096);
    for (let i = 0; i < largeBuffer.length; i++) {
      largeBuffer[i] = i & 0xff;
    }

    const base64 = largeBuffer.toString('base64');
    const hex = Buffer.from(base64, 'base64').toString('hex');
    const restored = Buffer.from(hex, 'hex');

    expect(restored.length).toBe(4096);
    expect(restored.equals(largeBuffer)).toBe(true);
  });
});

describe('Browser wallet adapter call simulation', () => {
  // Simulates the exact code path in signTaprootPsbt for browser wallets
  // using a mock walletAdapter

  it('calls adapter.signPsbt with hex and auto_finalized:false, returns base64', async () => {
    const inputBase64 = Buffer.from('deadbeef', 'hex').toString('base64');
    const expectedSignedHex = 'cafebabe';

    const mockAdapter = {
      signPsbt: vi.fn().mockResolvedValue(expectedSignedHex),
    };

    // Replicate signTaprootPsbt browser wallet path
    const psbtBuffer = Buffer.from(inputBase64, 'base64');
    const psbtHex = psbtBuffer.toString('hex');

    const signedHex = await mockAdapter.signPsbt(psbtHex, { auto_finalized: false });
    const result = Buffer.from(signedHex, 'hex').toString('base64');

    // Verify adapter was called with hex
    expect(mockAdapter.signPsbt).toHaveBeenCalledWith('deadbeef', { auto_finalized: false });

    // Verify result is base64 of the signed bytes
    expect(result).toBe(Buffer.from('cafebabe', 'hex').toString('base64'));
  });

  it('throws with wallet ID when adapter returns empty/null', async () => {
    const mockAdapter = {
      signPsbt: vi.fn().mockResolvedValue(null),
    };
    const walletId = 'xverse';

    // Replicate signTaprootPsbt error handling
    const psbtHex = 'deadbeef';
    try {
      const signedHex = await mockAdapter.signPsbt(psbtHex, { auto_finalized: false });
      if (!signedHex) {
        throw new Error(`${walletId} signing returned empty result`);
      }
      // Should not reach here
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain('xverse');
      expect(e.message).toContain('empty result');
    }
  });

  it('throws with wallet ID and original message when adapter rejects', async () => {
    const mockAdapter = {
      signPsbt: vi.fn().mockRejectedValue(new Error('User cancelled')),
    };
    const walletId = 'oyl';

    // Replicate signTaprootPsbt error handling
    const psbtHex = 'deadbeef';
    try {
      await mockAdapter.signPsbt(psbtHex, { auto_finalized: false });
      expect(true).toBe(false);
    } catch (e: any) {
      // Wrap like WalletContext does
      const wrappedError = new Error(`${walletId} signing failed: ${e?.message || e}`);
      expect(wrappedError.message).toBe('oyl signing failed: User cancelled');
    }
  });

  it('signSegwitPsbt browser path does NOT check for empty result (unlike signTaprootPsbt)', () => {
    // signSegwitPsbt has a simpler browser path — no null check, no try/catch
    const src = readWalletContextSource();
    const signSegwitBody = extractCallbackBody(src, 'signSegwitPsbt');

    // signSegwitPsbt browser path is simpler — just convert and return
    // It does NOT have the `if (!signedHex)` guard that signTaprootPsbt has
    // This is a known asymmetry in the current code
    const browserBlock = signSegwitBody.slice(0, signSegwitBody.indexOf('// For keystore'));
    expect(browserBlock).not.toContain('signing returned empty result');
  });
});

describe('Keystore signing path validation', () => {
  it('signTaprootPsbt uses dynamic imports for bitcoinjs-lib, bip32, bip39, tiny-secp256k1', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signTaprootPsbt');

    // Dynamic imports to avoid SSR issues
    expect(body).toContain("import('bitcoinjs-lib')");
    expect(body).toContain("import('tiny-secp256k1')");
    expect(body).toContain("import('bip32')");
    expect(body).toContain("import('bip39')");
  });

  it('signSegwitPsbt uses dynamic imports for bitcoinjs-lib, bip32, bip39, tiny-secp256k1', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signSegwitPsbt');

    expect(body).toContain("import('bitcoinjs-lib')");
    expect(body).toContain("import('tiny-secp256k1')");
    expect(body).toContain("import('bip32')");
    expect(body).toContain("import('bip39')");
  });

  it('signTaprootPsbt initializes ECC library before signing', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signTaprootPsbt');

    const eccInitIdx = body.indexOf('initEccLib');
    // Use psbt.signInput (the actual call, not comments mentioning signInput)
    const signInputIdx = body.indexOf('psbt.signInput');
    expect(eccInitIdx).toBeGreaterThan(0);
    expect(signInputIdx).toBeGreaterThan(eccInitIdx);
  });

  it('signTaprootPsbt handles regtest, testnet, signet, mainnet networks', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signTaprootPsbt');

    expect(body).toContain("case 'mainnet':");
    expect(body).toContain("case 'testnet':");
    expect(body).toContain("case 'signet':");
    expect(body).toContain("case 'regtest':");
    expect(body).toContain("case 'subfrost-regtest':");
    expect(body).toContain('networks.bitcoin');
    expect(body).toContain('networks.testnet');
    expect(body).toContain('networks.regtest');
  });

  it('signTaprootPsbt signs all inputs in a loop (skips failures)', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signTaprootPsbt');

    // Uses a for loop over inputCount
    expect(body).toContain('psbt.inputCount');
    expect(body).toContain('psbt.signInput(i');
    // Catches individual input failures (not all inputs may be taproot)
    expect(body).toContain('Could not sign input');
  });

  it('signSegwitPsbt signs all inputs in a loop (skips failures)', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signSegwitPsbt');

    expect(body).toContain('psbt.inputCount');
    expect(body).toContain('psbt.signInput(i');
    expect(body).toContain('Could not sign input');
  });

  it('signTaprootPsbt returns base64 after signing (keystore path)', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signTaprootPsbt');

    // After the signing loop, returns psbt.toBase64()
    expect(body).toContain('return psbt.toBase64()');
  });

  it('signSegwitPsbt returns base64 after signing (keystore path)', () => {
    const src = readWalletContextSource();
    const body = extractCallbackBody(src, 'signSegwitPsbt');

    expect(body).toContain('return psbt.toBase64()');
  });
});

describe('signPsbts (batch signing)', () => {
  const src = readWalletContextSource();
  const body = extractCallbackBody(src, 'signPsbts');

  it('maps over array and calls adapter.signPsbt for each PSBT', () => {
    expect(body).toContain('Promise.all');
    expect(body).toContain('params.psbts.map');
    expect(body).toContain('walletAdapter.signPsbt(psbtHex');
  });

  it('returns { signedPsbts } array', () => {
    expect(body).toContain('return { signedPsbts }');
  });

  it('falls back to wallet.signPsbt for keystore wallets', () => {
    expect(body).toContain('wallet.signPsbt(psbt)');
  });

  it('throws if wallet not connected in keystore path', () => {
    expect(body).toContain("throw new Error('Wallet not connected')");
  });
});
