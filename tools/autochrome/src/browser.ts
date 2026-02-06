/**
 * Browser Session Manager for Autochrome
 *
 * Manages Puppeteer browser sessions with wallet extension support.
 */

import puppeteer, {
  Browser,
  Page,
  CDPSession,
  Cookie,
  CookieParam,
} from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export interface WalletExtension {
  id: string;
  name: string;
  path: string; // Path to unpacked extension directory
}

export interface SessionConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userDataDir?: string;
  extensions?: WalletExtension[];
  slowMo?: number; // Slow down by ms for debugging
  devtools?: boolean;
}

export interface HarEntry {
  startedDateTime: string;
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    postData?: { text: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    content: { size: number; mimeType: string; text?: string };
  };
  time: number;
}

export interface HarLog {
  version: string;
  creator: { name: string; version: string };
  entries: HarEntry[];
}

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdpSession: CDPSession | null = null;
  private config: SessionConfig;
  private networkEntries: HarEntry[] = [];
  private isCapturingNetwork: boolean = false;
  private consoleMessages: Array<{ type: string; text: string; timestamp: Date }> = [];

  constructor(config: SessionConfig = {}) {
    this.config = {
      headless: false,
      viewport: { width: 1440, height: 900 },
      slowMo: 50,
      devtools: false,
      ...config,
    };
  }

  async launch(): Promise<void> {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      `--window-size=${this.config.viewport!.width},${this.config.viewport!.height}`,
    ];

    // Add extensions if specified
    if (this.config.extensions && this.config.extensions.length > 0) {
      const extensionPaths = this.config.extensions
        .map(ext => ext.path)
        .filter(p => fs.existsSync(p));

      if (extensionPaths.length > 0) {
        args.push(`--disable-extensions-except=${extensionPaths.join(',')}`);
        args.push(`--load-extension=${extensionPaths.join(',')}`);
      }
    }

    // Add user data dir if specified (for persistent sessions)
    if (this.config.userDataDir) {
      args.push(`--user-data-dir=${this.config.userDataDir}`);
    }

    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args,
      defaultViewport: this.config.viewport,
      slowMo: this.config.slowMo,
      devtools: this.config.devtools,
    });

    // Get the first page or create one
    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();

    // Set up console message capture
    this.page.on('console', msg => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date(),
      });
    });

    // Remove webdriver flag
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });
  }

  async navigate(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' }): Promise<{
    url: string;
    title: string;
    status: string;
  }> {
    if (!this.page) throw new Error('Session not started');

    const response = await this.page.goto(url, {
      waitUntil: options?.waitUntil || 'networkidle2',
      timeout: 60000,
    });

    return {
      url: this.page.url(),
      title: await this.page.title(),
      status: response?.status()?.toString() || 'unknown',
    };
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    await this.page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await this.page.click(selector);
  }

  async type(selector: string, text: string, options?: { delay?: number }): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    await this.page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await this.page.type(selector, text, { delay: options?.delay || 50 });
  }

  async press(key: string): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    await this.page.keyboard.press(key as any);
  }

  async waitForSelector(selector: string, options?: { timeout?: number; visible?: boolean }): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    await this.page.waitForSelector(selector, {
      timeout: options?.timeout || 30000,
      visible: options?.visible ?? true,
    });
  }

  async waitForNavigation(options?: { timeout?: number }): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    await this.page.waitForNavigation({
      timeout: options?.timeout || 30000,
      waitUntil: 'networkidle2',
    });
  }

  async screenshot(options?: { fullPage?: boolean; path?: string }): Promise<Buffer> {
    if (!this.page) throw new Error('Session not started');
    const buffer = await this.page.screenshot({
      fullPage: options?.fullPage || false,
      path: options?.path,
      type: 'png',
    });
    return buffer as Buffer;
  }

  async getHtml(): Promise<string> {
    if (!this.page) throw new Error('Session not started');
    return await this.page.content();
  }

  async getText(): Promise<string> {
    if (!this.page) throw new Error('Session not started');
    return await this.page.evaluate(() => document.body.innerText);
  }

  async query(selector: string, options?: { all?: boolean; includeText?: boolean }): Promise<any[]> {
    if (!this.page) throw new Error('Session not started');

    const elements = await this.page.evaluate((sel, opts) => {
      const nodes = opts?.all
        ? Array.from(document.querySelectorAll(sel))
        : [document.querySelector(sel)].filter(Boolean);

      return nodes.map(el => ({
        tagName: el!.tagName.toLowerCase(),
        id: el!.id || null,
        className: el!.className || null,
        text: opts?.includeText ? el!.textContent?.trim() : null,
        href: (el as HTMLAnchorElement).href || null,
        value: (el as HTMLInputElement).value || null,
        outerHTML: el!.outerHTML.substring(0, 500),
      }));
    }, selector, options);

    return elements;
  }

  async execute<T = unknown>(script: string): Promise<T> {
    if (!this.page) throw new Error('Session not started');
    return await this.page.evaluate(script) as T;
  }

  async startNetworkCapture(): Promise<void> {
    if (!this.page) throw new Error('Session not started');

    this.cdpSession = await this.page.target().createCDPSession();
    this.networkEntries = [];
    this.isCapturingNetwork = true;

    await this.cdpSession.send('Network.enable');

    const requestMap = new Map<string, any>();

    this.cdpSession.on('Network.requestWillBeSent', (params: any) => {
      requestMap.set(params.requestId, {
        startedDateTime: new Date().toISOString(),
        request: {
          method: params.request.method,
          url: params.request.url,
          headers: Object.entries(params.request.headers).map(([name, value]) => ({ name, value: String(value) })),
          postData: params.request.postData ? { text: params.request.postData } : undefined,
        },
        startTime: Date.now(),
      });
    });

    this.cdpSession.on('Network.responseReceived', (params: any) => {
      const entry = requestMap.get(params.requestId);
      if (entry) {
        entry.response = {
          status: params.response.status,
          statusText: params.response.statusText,
          headers: Object.entries(params.response.headers).map(([name, value]) => ({ name, value: String(value) })),
          content: {
            size: params.response.encodedDataLength || 0,
            mimeType: params.response.mimeType,
          },
        };
      }
    });

    this.cdpSession.on('Network.loadingFinished', (params: any) => {
      const entry = requestMap.get(params.requestId);
      if (entry && entry.response) {
        entry.time = Date.now() - entry.startTime;
        delete entry.startTime;
        this.networkEntries.push(entry);
        requestMap.delete(params.requestId);
      }
    });
  }

  async stopNetworkCapture(): Promise<void> {
    if (this.cdpSession) {
      await this.cdpSession.send('Network.disable');
      this.cdpSession.removeAllListeners();
      this.isCapturingNetwork = false;
    }
  }

  getHar(): HarLog {
    return {
      version: '1.2',
      creator: {
        name: 'autochrome',
        version: '0.1.0',
      },
      entries: this.networkEntries,
    };
  }

  getConsoleMessages(): Array<{ type: string; text: string; timestamp: Date }> {
    return this.consoleMessages;
  }

  clearConsoleMessages(): void {
    this.consoleMessages = [];
  }

  async getAccessibilityTree(): Promise<any> {
    if (!this.page) throw new Error('Session not started');
    return await this.page.accessibility.snapshot();
  }

  async getCookies(): Promise<Cookie[]> {
    if (!this.page) throw new Error('Session not started');
    return await this.page.cookies();
  }

  async setCookies(cookies: CookieParam[]): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    await this.page.setCookie(...cookies);
  }

  async clearCookies(): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    const client = await this.page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
  }

  async getLocalStorage(): Promise<Record<string, string>> {
    if (!this.page) throw new Error('Session not started');
    return await this.page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) items[key] = localStorage.getItem(key) || '';
      }
      return items;
    });
  }

  async setLocalStorage(items: Record<string, string>): Promise<void> {
    if (!this.page) throw new Error('Session not started');
    await this.page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, value);
      }
    }, items);
  }

  getPage(): Page | null {
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  async close(): Promise<void> {
    if (this.cdpSession) {
      this.cdpSession.removeAllListeners();
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

/**
 * Session manager for multiple browser sessions
 */
export class SessionManager {
  private sessions: Map<string, BrowserSession> = new Map();
  private sessionCounter = 0;

  async createSession(config?: SessionConfig): Promise<{ sessionId: string; session: BrowserSession }> {
    const sessionId = `sess_${++this.sessionCounter}`;
    const session = new BrowserSession(config);
    await session.launch();
    this.sessions.set(sessionId, session);
    return { sessionId, session };
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      this.sessions.delete(sessionId);
    }
  }

  async closeAll(): Promise<void> {
    for (const [id, session] of this.sessions) {
      await session.close();
    }
    this.sessions.clear();
  }
}
