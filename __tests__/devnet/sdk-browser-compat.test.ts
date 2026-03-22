/**
 * SDK Browser Compatibility Test
 *
 * Validates that the public/sdk/qubitcoin/ files don't contain
 * bare module imports that would fail in the browser.
 *
 * Browser ESM can only resolve:
 * - Relative: './foo.js', '../bar.js'
 * - Absolute URL: '/sdk/qubitcoin/foo.js', 'https://...'
 *
 * It CANNOT resolve bare specifiers: 'wasmoon', 'crypto', 'fs', etc.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const SDK_DIR = resolve(__dirname, '../../public/sdk/qubitcoin');

// Node.js builtins and npm packages that can't resolve in browsers
const BARE_SPECIFIERS = [
  'wasmoon', 'crypto', 'fs', 'path', 'os', 'child_process',
  'http', 'https', 'stream', 'buffer', 'util', 'events',
  'assert', 'url', 'querystring', 'zlib',
];

function getActiveImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const imports: string[] = [];

  for (const line of content.split('\n')) {
    // Skip comments
    if (line.trimStart().startsWith('//')) continue;
    if (line.trimStart().startsWith('*')) continue;

    // Only check top-level static imports (not dynamic import() inside functions)
    // Dynamic imports inside functions are OK — they only run if that code path is hit
    const match = line.match(/^(?:import|export)\s+.*\s+from\s+['"](.*?)['"]/);
    if (match) imports.push(match[1]);
  }

  return imports;
}

describe('SDK Browser Compatibility', () => {
  it('index.js has no bare module imports', () => {
    const imports = getActiveImports(resolve(SDK_DIR, 'index.js'));
    const bareImports = imports.filter(imp =>
      !imp.startsWith('.') && !imp.startsWith('/')
    );
    expect(bareImports).toEqual([]);
  });

  it('devnet-server.js has no bare module imports', () => {
    const imports = getActiveImports(resolve(SDK_DIR, 'devnet-server.js'));
    const bareImports = imports.filter(imp =>
      !imp.startsWith('.') && !imp.startsWith('/')
    );
    expect(bareImports).toEqual([]);
  });

  it('node.js has no bare module imports', () => {
    const imports = getActiveImports(resolve(SDK_DIR, 'node.js'));
    const bareImports = imports.filter(imp =>
      !imp.startsWith('.') && !imp.startsWith('/')
    );
    expect(bareImports).toEqual([]);
  });

  it('indexer.js has no bare module imports', () => {
    const imports = getActiveImports(resolve(SDK_DIR, 'indexer.js'));
    const bareImports = imports.filter(imp =>
      !imp.startsWith('.') && !imp.startsWith('/')
    );
    expect(bareImports).toEqual([]);
  });

  it('all active SDK JS files have only relative/absolute imports', () => {
    // Only check files that are actively imported (not lua-runtime.js)
    const activeFiles = ['index.js', 'devnet-server.js', 'node.js', 'indexer.js', 'types.js'];

    for (const file of activeFiles) {
      const filePath = resolve(SDK_DIR, file);
      const imports = getActiveImports(filePath);
      const bareImports = imports.filter(imp =>
        !imp.startsWith('.') && !imp.startsWith('/')
      );

      if (bareImports.length > 0) {
        throw new Error(
          `${file} has bare module imports that will fail in browser: ${bareImports.join(', ')}`
        );
      }
    }
  });

  it('WASM binding file exists', () => {
    const wasmJs = resolve(SDK_DIR, 'wasm/qubitcoin_web_sys.js');
    const content = readFileSync(wasmJs, 'utf-8');
    expect(content).toContain('qubitcoin_web_sys_bg.wasm');
  });

  it('WASM binary exists and is non-empty', () => {
    const wasmBin = resolve(SDK_DIR, 'wasm/qubitcoin_web_sys_bg.wasm');
    const data = readFileSync(wasmBin);
    expect(data.length).toBeGreaterThan(100_000); // Should be ~887KB
  });
});
