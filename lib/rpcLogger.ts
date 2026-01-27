/**
 * RPC Logger - Centralized logging for JSON-RPC calls
 *
 * Provides detailed logging for debugging RPC issues in the frontend.
 * Enable verbose mode by setting localStorage.setItem('RPC_DEBUG', 'true')
 *
 * LOCAL TESTING SUPPORT:
 * This logger was added to support local Docker testing (regtest-local network).
 * When running against a local alkanes-rs jsonrpc proxy, this provides visibility
 * into RPC calls and responses. In production, lua scripts (balances.lua, etc.)
 * running on hosted regtest are the standard method for fetching enriched data.
 *
 * Usage in browser console:
 *   rpcDebug.enable()   - Turn on verbose logging
 *   rpcDebug.disable()  - Turn off verbose logging
 *   rpcDebug.isEnabled() - Check current state
 */

const LOG_PREFIX = '[RPC]';

// Check if verbose logging is enabled
function isVerbose(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('RPC_DEBUG') === 'true';
}

// Get current timestamp
function timestamp(): string {
  return new Date().toISOString().split('T')[1].split('.')[0];
}

/**
 * Log an RPC request
 */
export function logRpcRequest(method: string, params: unknown, url?: string) {
  const verbose = isVerbose();

  console.log(`${LOG_PREFIX} [${timestamp()}] → ${method}`, url ? `(${url})` : '');

  if (verbose && params) {
    console.log(`${LOG_PREFIX}   params:`, JSON.stringify(params, null, 2));
  }
}

/**
 * Log an RPC response
 */
export function logRpcResponse(method: string, result: unknown, durationMs?: number) {
  const verbose = isVerbose();
  const duration = durationMs ? ` (${durationMs}ms)` : '';

  console.log(`${LOG_PREFIX} [${timestamp()}] ← ${method}${duration} OK`);

  if (verbose && result !== undefined) {
    // Truncate large responses
    const resultStr = JSON.stringify(result);
    if (resultStr.length > 2000) {
      console.log(`${LOG_PREFIX}   result: ${resultStr.slice(0, 2000)}... (truncated, ${resultStr.length} chars)`);
    } else {
      console.log(`${LOG_PREFIX}   result:`, result);
    }
  }
}

/**
 * Log an RPC error
 */
export function logRpcError(method: string, error: unknown, params?: unknown, url?: string) {
  console.error(`${LOG_PREFIX} [${timestamp()}] ✗ ${method} FAILED`, url ? `(${url})` : '');

  // Always log error details
  if (error instanceof Error) {
    console.error(`${LOG_PREFIX}   error: ${error.message}`);
    if (error.stack && isVerbose()) {
      console.error(`${LOG_PREFIX}   stack:`, error.stack);
    }
  } else if (typeof error === 'object' && error !== null) {
    // JSON-RPC error format
    const rpcError = error as { code?: number; message?: string; data?: unknown };
    if (rpcError.code !== undefined || rpcError.message) {
      console.error(`${LOG_PREFIX}   code: ${rpcError.code}, message: ${rpcError.message}`);
      if (rpcError.data) {
        console.error(`${LOG_PREFIX}   data:`, rpcError.data);
      }
    } else {
      console.error(`${LOG_PREFIX}   error:`, JSON.stringify(error));
    }
  } else {
    console.error(`${LOG_PREFIX}   error:`, error);
  }

  // Log params on error for debugging
  if (params !== undefined) {
    console.error(`${LOG_PREFIX}   params were:`, JSON.stringify(params));
  }
}

/**
 * Log WASM SDK method calls
 */
export function logWasmCall(methodName: string, args: unknown[]) {
  const verbose = isVerbose();

  console.log(`${LOG_PREFIX} [${timestamp()}] WASM.${methodName}`);

  if (verbose && args.length > 0) {
    args.forEach((arg, i) => {
      const argStr = typeof arg === 'string' ? arg : JSON.stringify(arg);
      if (argStr.length > 500) {
        console.log(`${LOG_PREFIX}   arg[${i}]: ${argStr.slice(0, 500)}... (truncated)`);
      } else {
        console.log(`${LOG_PREFIX}   arg[${i}]:`, arg);
      }
    });
  }
}

/**
 * Log WASM SDK method result
 */
export function logWasmResult(methodName: string, result: unknown, durationMs?: number) {
  const verbose = isVerbose();
  const duration = durationMs ? ` (${durationMs}ms)` : '';

  console.log(`${LOG_PREFIX} [${timestamp()}] WASM.${methodName}${duration} OK`);

  if (verbose && result !== undefined) {
    const resultStr = JSON.stringify(result);
    if (resultStr && resultStr.length > 1000) {
      console.log(`${LOG_PREFIX}   result: ${resultStr.slice(0, 1000)}... (truncated)`);
    } else {
      console.log(`${LOG_PREFIX}   result:`, result);
    }
  }
}

/**
 * Log WASM SDK method error
 */
export function logWasmError(methodName: string, error: unknown, args?: unknown[]) {
  console.error(`${LOG_PREFIX} [${timestamp()}] WASM.${methodName} FAILED`);

  if (error instanceof Error) {
    console.error(`${LOG_PREFIX}   error: ${error.message}`);
    // Check for WASM-specific error info
    if ('cause' in error) {
      console.error(`${LOG_PREFIX}   cause:`, (error as any).cause);
    }
  } else {
    console.error(`${LOG_PREFIX}   error:`, error);
  }

  if (args && args.length > 0) {
    console.error(`${LOG_PREFIX}   args were:`, args.map(a =>
      typeof a === 'string' && a.length > 200 ? a.slice(0, 200) + '...' : a
    ));
  }
}

/**
 * Create a wrapped fetch that logs all JSON-RPC calls
 */
export function createLoggingFetch(baseUrl: string) {
  return async function loggingFetch(
    method: string,
    params: unknown[] = [],
    id: number | string = 1
  ): Promise<unknown> {
    const startTime = Date.now();

    logRpcRequest(method, params, baseUrl);

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
      });

      const json = await response.json();
      const duration = Date.now() - startTime;

      if (json.error) {
        logRpcError(method, json.error, params, baseUrl);
        throw new Error(json.error.message || JSON.stringify(json.error));
      }

      logRpcResponse(method, json.result, duration);
      return json.result;
    } catch (error) {
      logRpcError(method, error, params, baseUrl);
      throw error;
    }
  };
}

/**
 * Enable verbose RPC logging
 */
export function enableRpcDebug() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('RPC_DEBUG', 'true');
    console.log(`${LOG_PREFIX} Verbose logging ENABLED. Reload page to take full effect.`);
  }
}

/**
 * Disable verbose RPC logging
 */
export function disableRpcDebug() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('RPC_DEBUG');
    console.log(`${LOG_PREFIX} Verbose logging DISABLED.`);
  }
}

// Expose to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).rpcDebug = {
    enable: enableRpcDebug,
    disable: disableRpcDebug,
    isEnabled: isVerbose,
  };
}
