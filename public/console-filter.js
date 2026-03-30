/**
 * Global console noise filter for devnet.
 * Suppresses high-frequency WASM indexer and SDK debug logs.
 * Add ?verbose to URL to disable filtering.
 */
(function() {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).has('verbose')) return;

  var NOISE = [
    '__get_len', '__flush', '__get]', 'get_count', 'MISS',
    '[DEBUG]', '[INFO]', 'call:', 'checking for error',
    'deprecated parameters', 'Sourcemap for',
    '[enrichedWalletQueryOptions]', '[BALANCE]',
    '[alkaneBalanceQuery]', '[useAlkanesTokenPairs]',
    '[fetchPoolsFromSDK]', '[usePools]',
    '[WalletProvider]', 'JsonRpcProvider::call',
    'Wallet state:', 'spendable UTXOs',
    '[ioredis]', 'Unhandled error event',
    '[tertiary]', '[useLPPositions]', '[useSwapQuotes]',
    '[useTokenNames]', '[SwapShell]',
    'Cellpack', 'AlkaneId',
  ];

  // Short tokens from Rust Debug struct printing (each field printed separately)
  var SHORT_NOISE = ['target', 'inputs', 'block', 'tx', 'false', 'true'];

  function isNoisy(args) {
    if (args.length === 1) {
      var a = args[0];
      if (typeof a === 'string') {
        // Filter known noise substrings
        for (var j = 0; j < NOISE.length; j++) {
          if (a.indexOf(NOISE[j]) !== -1) return true;
        }
        // Filter very short messages (Rust Debug struct field-by-field printing)
        var trimmed = a.trim();
        if (trimmed.length <= 5) return true;
        for (var k = 0; k < SHORT_NOISE.length; k++) {
          if (trimmed === SHORT_NOISE[k]) return true;
        }
      }
    } else {
      for (var i = 0; i < args.length; i++) {
        var b = args[i];
        if (typeof b === 'string') {
          for (var j2 = 0; j2 < NOISE.length; j2++) {
            if (b.indexOf(NOISE[j2]) !== -1) return true;
          }
        }
      }
    }
    return false;
  }

  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;

  console.log = function() { if (!isNoisy(arguments)) origLog.apply(console, arguments); };
  console.warn = function() { if (!isNoisy(arguments)) origWarn.apply(console, arguments); };
  console.error = function() { if (!isNoisy(arguments)) origError.apply(console, arguments); };
})();
