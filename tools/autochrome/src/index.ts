/**
 * Autochrome - Interactive browser automation for wallet testing
 *
 * @example
 * ```typescript
 * import { BrowserSession, SessionManager } from '@subfrost/autochrome';
 *
 * const session = new BrowserSession({ headless: false });
 * await session.launch();
 * await session.navigate('https://subfrost.io');
 * await session.click('button.connect-wallet');
 * await session.close();
 * ```
 */

export {
  BrowserSession,
  SessionManager,
  type SessionConfig,
  type WalletExtension,
  type HarEntry,
  type HarLog,
} from './browser.js';
