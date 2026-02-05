#!/usr/bin/env npx tsx
/**
 * Autochrome REST API Server
 *
 * Provides HTTP endpoints for controlling browser sessions remotely.
 * Enables interactive testing from chat, scripts, or other tools.
 *
 * Usage:
 *   npx tsx src/server.ts [--port 3030] [--host 0.0.0.0]
 *
 * Endpoints:
 *   POST /session          - Create new browser session
 *   DELETE /session/:id    - Close session
 *   GET /sessions          - List all sessions
 *
 *   POST /navigate         - Navigate to URL
 *   POST /click            - Click element
 *   POST /type             - Type text into element
 *   POST /screenshot       - Take screenshot (returns base64)
 *   POST /query            - Query DOM elements
 *   POST /execute          - Execute JavaScript
 *   GET /html              - Get page HTML
 *   GET /text              - Get page text content
 *   GET /url               - Get current URL
 *
 *   POST /capture/start    - Start network capture
 *   POST /capture/stop     - Stop network capture
 *   GET /har               - Get HAR log
 *
 *   GET /cookies           - Get cookies
 *   GET /localstorage      - Get localStorage
 */

import * as http from 'http';
import * as url from 'url';
import { SessionManager, BrowserSession, SessionConfig, WalletExtension } from './browser.js';

const sessionManager = new SessionManager();
let currentSessionId: string | null = null;

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function jsonResponse<T>(res: http.ServerResponse, data: ApiResponse<T>, statusCode = 200): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function errorResponse(res: http.ServerResponse, error: string, statusCode = 400): void {
  jsonResponse(res, { success: false, error }, statusCode);
}

async function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getCurrentSession(): BrowserSession | null {
  if (!currentSessionId) return null;
  return sessionManager.getSession(currentSessionId) || null;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '/';
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // Session management
    if (pathname === '/session' && method === 'POST') {
      const body = await parseBody(req);
      const extensions: WalletExtension[] = [];

      // Support loading wallet extensions
      if (body.wallet) {
        const walletPath = `${process.env.HOME}/.autochrome/extensions/${body.wallet}`;
        extensions.push({ id: body.wallet, name: body.wallet, path: walletPath });
      }

      const config: SessionConfig = {
        headless: body.headless ?? false,
        viewport: body.viewport || { width: 1440, height: 900 },
        extensions,
        slowMo: body.slowMo ?? 50,
        devtools: body.devtools ?? false,
      };

      const { sessionId, session } = await sessionManager.createSession(config);
      currentSessionId = sessionId;

      // Navigate to initial URL if provided
      if (body.url) {
        await session.navigate(body.url);
      }

      jsonResponse(res, {
        success: true,
        data: {
          sessionId,
          url: body.url || 'about:blank',
          message: `Session created${body.wallet ? ` with ${body.wallet} wallet` : ''}`,
        },
      });
      return;
    }

    if (pathname === '/sessions' && method === 'GET') {
      jsonResponse(res, {
        success: true,
        data: {
          sessions: sessionManager.listSessions(),
          current: currentSessionId,
        },
      });
      return;
    }

    if (pathname.startsWith('/session/') && method === 'DELETE') {
      const sessionId = pathname.split('/')[2];
      await sessionManager.closeSession(sessionId);
      if (currentSessionId === sessionId) {
        currentSessionId = null;
      }
      jsonResponse(res, { success: true, data: { message: `Session ${sessionId} closed` } });
      return;
    }

    if (pathname === '/session/switch' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.sessionId) {
        errorResponse(res, 'sessionId required');
        return;
      }
      const session = sessionManager.getSession(body.sessionId);
      if (!session) {
        errorResponse(res, 'Session not found', 404);
        return;
      }
      currentSessionId = body.sessionId;
      jsonResponse(res, { success: true, data: { current: currentSessionId } });
      return;
    }

    // All other endpoints require an active session
    const session = getCurrentSession();
    if (!session) {
      errorResponse(res, 'No active session. Create one with POST /session', 400);
      return;
    }

    // Navigation
    if (pathname === '/navigate' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.url) {
        errorResponse(res, 'url required');
        return;
      }
      const result = await session.navigate(body.url, { waitUntil: body.waitUntil });
      jsonResponse(res, { success: true, data: result });
      return;
    }

    if (pathname === '/url' && method === 'GET') {
      const page = session.getPage();
      jsonResponse(res, {
        success: true,
        data: {
          url: page?.url() || '',
          title: await page?.title() || '',
        },
      });
      return;
    }

    // Interactions
    if (pathname === '/click' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.selector) {
        errorResponse(res, 'selector required');
        return;
      }
      await session.click(body.selector);
      jsonResponse(res, { success: true, data: { clicked: body.selector } });
      return;
    }

    if (pathname === '/type' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.selector || body.text === undefined) {
        errorResponse(res, 'selector and text required');
        return;
      }
      await session.type(body.selector, body.text, { delay: body.delay });
      jsonResponse(res, { success: true, data: { typed: body.text, into: body.selector } });
      return;
    }

    if (pathname === '/press' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.key) {
        errorResponse(res, 'key required');
        return;
      }
      await session.press(body.key);
      jsonResponse(res, { success: true, data: { pressed: body.key } });
      return;
    }

    if (pathname === '/wait' && method === 'POST') {
      const body = await parseBody(req);
      if (body.selector) {
        await session.waitForSelector(body.selector, { timeout: body.timeout, visible: body.visible });
        jsonResponse(res, { success: true, data: { found: body.selector } });
      } else if (body.ms) {
        await new Promise(resolve => setTimeout(resolve, body.ms));
        jsonResponse(res, { success: true, data: { waited: body.ms } });
      } else if (body.navigation) {
        await session.waitForNavigation({ timeout: body.timeout });
        const page = session.getPage();
        jsonResponse(res, { success: true, data: { url: page?.url() } });
      } else {
        errorResponse(res, 'selector, ms, or navigation required');
      }
      return;
    }

    // Content extraction
    if (pathname === '/screenshot' && method === 'POST') {
      const body = await parseBody(req);
      const buffer = await session.screenshot({ fullPage: body.fullPage });
      const base64 = buffer.toString('base64');

      // If path specified, also save to file
      if (body.path) {
        const fs = await import('fs');
        fs.writeFileSync(body.path, buffer);
      }

      jsonResponse(res, {
        success: true,
        data: {
          base64,
          size: buffer.length,
          path: body.path || null,
        },
      });
      return;
    }

    if (pathname === '/html' && method === 'GET') {
      const html = await session.getHtml();
      jsonResponse(res, { success: true, data: { html, length: html.length } });
      return;
    }

    if (pathname === '/text' && method === 'GET') {
      const text = await session.getText();
      jsonResponse(res, { success: true, data: { text } });
      return;
    }

    if (pathname === '/query' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.selector) {
        errorResponse(res, 'selector required');
        return;
      }
      const elements = await session.query(body.selector, {
        all: body.all ?? true,
        includeText: body.includeText ?? true,
      });
      jsonResponse(res, { success: true, data: { elements, count: elements.length } });
      return;
    }

    if (pathname === '/execute' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.script) {
        errorResponse(res, 'script required');
        return;
      }
      const result = await session.execute(body.script);
      jsonResponse(res, { success: true, data: { result } });
      return;
    }

    // Network capture
    if (pathname === '/capture/start' && method === 'POST') {
      await session.startNetworkCapture();
      jsonResponse(res, { success: true, data: { message: 'Network capture started' } });
      return;
    }

    if (pathname === '/capture/stop' && method === 'POST') {
      await session.stopNetworkCapture();
      jsonResponse(res, { success: true, data: { message: 'Network capture stopped' } });
      return;
    }

    if (pathname === '/har' && method === 'GET') {
      const har = session.getHar();
      jsonResponse(res, { success: true, data: har });
      return;
    }

    // Storage
    if (pathname === '/cookies' && method === 'GET') {
      const cookies = await session.getCookies();
      jsonResponse(res, { success: true, data: { cookies } });
      return;
    }

    if (pathname === '/localstorage' && method === 'GET') {
      const storage = await session.getLocalStorage();
      jsonResponse(res, { success: true, data: { storage } });
      return;
    }

    if (pathname === '/console' && method === 'GET') {
      const messages = session.getConsoleMessages();
      jsonResponse(res, { success: true, data: { messages } });
      return;
    }

    if (pathname === '/accessibility' && method === 'GET') {
      const tree = await session.getAccessibilityTree();
      jsonResponse(res, { success: true, data: { tree } });
      return;
    }

    // Status endpoint
    if (pathname === '/' && method === 'GET') {
      jsonResponse(res, {
        success: true,
        data: {
          name: 'autochrome',
          version: '0.1.0',
          currentSession: currentSessionId,
          sessions: sessionManager.listSessions(),
          endpoints: [
            'POST /session - Create session',
            'GET /sessions - List sessions',
            'DELETE /session/:id - Close session',
            'POST /navigate - Navigate to URL',
            'POST /click - Click element',
            'POST /type - Type text',
            'POST /screenshot - Take screenshot',
            'POST /query - Query elements',
            'POST /execute - Run JavaScript',
            'GET /url - Get current URL',
            'GET /html - Get page HTML',
            'GET /text - Get page text',
            'POST /wait - Wait for selector/time/navigation',
            'POST /capture/start - Start network capture',
            'POST /capture/stop - Stop network capture',
            'GET /har - Get HAR log',
            'GET /cookies - Get cookies',
            'GET /localstorage - Get localStorage',
            'GET /console - Get console messages',
          ],
        },
      });
      return;
    }

    // 404 for unknown endpoints
    errorResponse(res, `Unknown endpoint: ${method} ${pathname}`, 404);

  } catch (error: any) {
    console.error(`Error handling ${method} ${pathname}:`, error);
    errorResponse(res, error.message, 500);
  }
}

// Main server
async function main() {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const hostIndex = args.indexOf('--host');

  const port = portIndex >= 0 ? parseInt(args[portIndex + 1]) : 3030;
  const host = hostIndex >= 0 ? args[hostIndex + 1] : '127.0.0.1';

  const server = http.createServer(handleRequest);

  server.listen(port, host, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Autochrome REST API                         ║
╚═══════════════════════════════════════════════════════════════╝

Server running at http://${host}:${port}

Quick start:
  1. Create session:
     curl -X POST http://${host}:${port}/session -H "Content-Type: application/json" \\
       -d '{"url": "https://staging-app.subfrost.io"}'

  2. Take screenshot:
     curl -X POST http://${host}:${port}/screenshot -H "Content-Type: application/json" \\
       -d '{"path": "screenshot.png"}'

  3. Click element:
     curl -X POST http://${host}:${port}/click -H "Content-Type: application/json" \\
       -d '{"selector": "button"}'

  4. Query DOM:
     curl -X POST http://${host}:${port}/query -H "Content-Type: application/json" \\
       -d '{"selector": "button", "all": true}'

Press Ctrl+C to stop the server.
`);
  });

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await sessionManager.closeAll();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Server error:', error);
  process.exit(1);
});

export { handleRequest };
