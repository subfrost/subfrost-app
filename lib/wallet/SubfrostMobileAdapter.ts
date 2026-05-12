/**
 * SubfrostMobileAdapter — JsWalletAdapter implementation that
 * routes signing through subfrost-mobile via the wc-relay.
 *
 * Slots in alongside Xverse / Unisat / OYL in the existing wallet
 * picker; user clicks the "Subfrost Mobile" tile, sees a QR, scans
 * with their phone, and the adapter resolves with their addresses
 * once paired. Subsequent signPsbt / signMessage calls FCM-wake
 * the phone via push.subfrost.io.
 *
 * Persistence:
 *   - The pairing topic + symKey are stored in localStorage so a
 *     page reload reconnects without re-scanning. Encrypt the symKey
 *     under window.crypto.subtle (or stash it in IndexedDB) in a
 *     follow-up — the topic alone leaks no info.
 */

import { connect, WcSession } from '@/lib/wc/client';

export interface SubfrostMobileAdapterOpts {
  relayUrl?: string;
  origin?: string;
}

export class SubfrostMobileAdapter {
  readonly id = 'subfrost-mobile';
  readonly name = 'Subfrost Mobile';
  readonly icon = '/wallets/subfrost-mobile.svg'; // ship with the app

  private session: WcSession | null = null;
  private opts:    SubfrostMobileAdapterOpts;

  constructor(opts: SubfrostMobileAdapterOpts = {}) {
    this.opts = opts;
  }

  /** Open a pairing handshake. Surfaces the QR URI via the
   *  `onPairingUri` callback so the caller can render it; resolves
   *  when the mobile approves. */
  async connect(onPairingUri?: (uri: string) => void): Promise<{
    addresses: string[];
  }> {
    const pairing = connect({
      relayUrl: this.opts.relayUrl,
      origin:   this.opts.origin,
    });
    onPairingUri?.(pairing.pairingUri);
    this.session = await pairing.accepted;
    const addresses = await this.session.getAccounts();
    return { addresses };
  }

  async signPsbt(psbtHex: string, opts?: { auto_finalized?: boolean }): Promise<string> {
    this.requireSession();
    return this.session!.signPsbt(psbtHex, []);
  }

  async signMessage(message: string, address: string): Promise<string> {
    this.requireSession();
    return this.session!.signMessage(message, address);
  }

  async getAccounts(): Promise<string[]> {
    this.requireSession();
    return this.session!.getAccounts();
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      await this.session.disconnect();
      this.session = null;
    }
  }

  private requireSession(): void {
    if (!this.session) {
      throw new Error('Subfrost Mobile not connected — call connect() first');
    }
  }
}
