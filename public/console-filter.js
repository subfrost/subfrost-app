/**
 * Global console noise filter for development.
 * Only allows messages matching an allowlist through.
 * Add ?verbose to URL to disable filtering entirely.
 */
(function() {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).has('verbose')) return;

  // ALLOWLIST: only these prefixes pass through
  var ALLOW = [
    '[devnet-boot]',
    '[DevnetContext]',
    '[devnet]',
    '[AlkanesSDK]',
    '[WalletContext]',
    '[LimitOrder]',
    '[useSwapMutation]',
    '[useWrapMutation]',
    '[useUnwrapMutation]',
    'Error',
    'error',
    'FATAL',
    'Carbine',
    'carbine',
    'Phase',
    'deployed',
    'Deploy',
    'FAILED',
    'HMR',
  ];

  function isAllowed(args) {
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (typeof a === 'string') {
        for (var j = 0; j < ALLOW.length; j++) {
          if (a.indexOf(ALLOW[j]) !== -1) return true;
        }
      }
      // Allow Error objects
      if (a instanceof Error) return true;
    }
    return false;
  }

  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;
  var origDebug = console.debug;

  console.log = function() { if (isAllowed(arguments)) origLog.apply(console, arguments); };
  console.warn = function() { if (isAllowed(arguments)) origWarn.apply(console, arguments); };
  console.debug = function() {};
  // console.error: allowlist same as log/warn, plus actual Error objects
  console.error = function() {
    if (arguments.length === 0) return;
    var first = arguments[0];
    // Always pass Error objects and stack traces
    if (first instanceof Error) { origError.apply(console, arguments); return; }
    // Pass if matches allowlist
    if (isAllowed(arguments)) { origError.apply(console, arguments); return; }
    // Block everything else (WASM noise, SDK debug, struct fields)
  };
})();
