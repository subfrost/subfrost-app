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
    '[tertiary]',
  ];

  function isNoisy(args) {
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (typeof a === 'string') {
        for (var j = 0; j < NOISE.length; j++) {
          if (a.indexOf(NOISE[j]) !== -1) return true;
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
