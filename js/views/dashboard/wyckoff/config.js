(function () {
  // Wyckoff configuration. Change endpoints / fallbacks / timings here only.
  window.WyckoffConfig = {
    WORKER_URL: 'https://morning-violet-ce94-wyckoff-trigger.gagula22.workers.dev',
    WATCHLIST_URL: 'wyckoff/watchlist.json',
    POLL_INTERVAL_MS: 1500,
    WATCHLIST_CACHE_MS: 5 * 60 * 1000,
    FALLBACK_SYMBOLS: [
      { symbol: 'BYBIT:BTCUSDT.P', label: 'BTCUSDT.P  — Bitcoin Perpetual',  type: 'perp' },
      { symbol: 'BYBIT:ETHUSDT.P', label: 'ETHUSDT.P  — Ethereum Perpetual', type: 'perp' },
      { symbol: 'BYBIT:SOLUSDT.P', label: 'SOLUSDT.P  — Solana Perpetual',   type: 'perp' }
    ]
  };
})();