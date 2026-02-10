/**
 * Shared address routing utilities for SDK parameter construction.
 *
 * The SDK's WASM tries base58 parsing first for toAddresses/changeAddress/alkanesChangeAddress.
 * Mainnet bech32/bech32m addresses (bc1p, bc1q) are longer than base58 expects and trigger
 * "LegacyAddressTooLong". Symbolic addresses (p2tr:0, p2wpkh:0) resolve via the loaded wallet,
 * avoiding this issue. P2SH/P2PKH addresses are base58-encoded and can be passed directly.
 *
 * For fromAddresses, actual addresses are passed as opaque strings to esplora for UTXO lookup
 * and work fine regardless of format.
 */

/**
 * Convert a real address to a symbolic SDK reference.
 * - bc1p/tb1p/bcrt1p (taproot) → 'p2tr:0'
 * - bc1q/tb1q/bcrt1q (native segwit) → 'p2wpkh:0'
 * - P2SH (3...) / P2PKH (1...) → passed through unchanged
 */
export function addressToSymbolic(address: string): string {
  const l = address.toLowerCase();
  if (l.startsWith('bc1p') || l.startsWith('tb1p') || l.startsWith('bcrt1p')) return 'p2tr:0';
  if (l.startsWith('bc1q') || l.startsWith('tb1q') || l.startsWith('bcrt1q')) return 'p2wpkh:0';
  return address;
}

export interface AddressConfig {
  /** Addresses for esplora UTXO discovery */
  fromAddresses: string[];
  /** Symbolic address for BTC fee change */
  changeAddress: string;
  /** Symbolic address for alkane token change */
  alkanesChangeAddress: string;
  /** True when wallet has only one address type */
  isSingleAddressMode: boolean;
}

/**
 * Compute SDK address parameters based on wallet type and available addresses.
 *
 * Single-address wallets (OKX, Unisat) only provide one address type.
 * Dual-address wallets (OYL, Xverse) provide both taproot and segwit.
 * Keystore wallets always derive both from the mnemonic.
 *
 * The critical fix: changeAddress and alkanesChangeAddress must match
 * the wallet's available address types. Hardcoding 'p2wpkh:0' + 'p2tr:0'
 * breaks single-address wallets — change goes to an address the wallet
 * cannot sign for.
 */
export function getAddressConfig(params: {
  walletType: 'browser' | 'keystore' | null;
  taprootAddress?: string;
  segwitAddress?: string;
}): AddressConfig {
  const { walletType, taprootAddress, segwitAddress } = params;

  const hasBoth =
    !!taprootAddress && !!segwitAddress && taprootAddress !== segwitAddress;

  if (walletType === 'browser') {
    if (hasBoth) {
      // Dual-address browser wallet (OYL, Xverse, Leather)
      return {
        fromAddresses: [segwitAddress!, taprootAddress!],
        changeAddress: 'p2wpkh:0',
        alkanesChangeAddress: 'p2tr:0',
        isSingleAddressMode: false,
      };
    }

    // Single-address browser wallet (OKX, Unisat)
    // These wallets expose one address at a time. We detect the type by parsing
    // the address format, then use the symbolic identifier (<type>:0) for ALL
    // fields — fromAddresses, changeAddress, alkanesChangeAddress, and
    // self-referencing toAddresses. The SDK's browser wallet adapter trait
    // handles address resolution and UTXO discovery through the extension API.
    const addr = taprootAddress || segwitAddress;
    if (!addr) {
      // Fallback — shouldn't happen if wallet is connected
      return {
        fromAddresses: [],
        changeAddress: 'p2tr:0',
        alkanesChangeAddress: 'p2tr:0',
        isSingleAddressMode: true,
      };
    }

    const symbolic = addressToSymbolic(addr);
    return {
      fromAddresses: [symbolic],
      changeAddress: symbolic,
      alkanesChangeAddress: symbolic,
      isSingleAddressMode: true,
    };
  }

  // Keystore wallets: always use symbolic references (mnemonic resolves them)
  if (hasBoth) {
    return {
      fromAddresses: ['p2wpkh:0', 'p2tr:0'],
      changeAddress: 'p2wpkh:0',
      alkanesChangeAddress: 'p2tr:0',
      isSingleAddressMode: false,
    };
  }

  // Keystore single-address (unusual but handle defensively)
  const symbolic = taprootAddress ? 'p2tr:0' : 'p2wpkh:0';
  return {
    fromAddresses: [symbolic],
    changeAddress: symbolic,
    alkanesChangeAddress: symbolic,
    isSingleAddressMode: true,
  };
}
