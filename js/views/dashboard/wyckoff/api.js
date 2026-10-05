(function () {
  // Wyckoff Worker API. Pure network I/O — no DOM. Change fetch logic here only.
  var CFG = window.WyckoffConfig;
  var _watchlistCache = null, _watchlistCacheTime = 0;

  async function loadWatchlist() {
    if (_watchlistCache && (Date.now() - _watchlistCacheTime) < CFG.WATCHLIST_CACHE_MS) {
      return _watchlistCache;
    }
    try {
      const res = await fetch(CFG.WATCHLIST_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      _watchlistCache = data.symbols || [];
      _watchlistCacheTime = Date.now();
      return _watchlistCache;
    } catch (e) {
      console.warn('[wyckoff-api] failed to load watchlist.json:', e.message);
      return CFG.FALLBACK_SYMBOLS;
    }
  }

  async function triggerAnalysis(symbol) {
    const res = await fetch(CFG.WORKER_URL + '/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: symbol })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  // Starts the local engine on this PC through the wyckoff:// protocol.
  // Must be called synchronously inside the click (browser requires a user gesture).
  // Nothing runs at boot — the engine starts only from this click, handles one report, and exits.
  function launchLocalRunner() {
    if (!CFG.LOCAL_RUNNER_URL) return;
    try { window.location.href = CFG.LOCAL_RUNNER_URL; }
    catch (e) { console.warn('[wyckoff-api] local runner launch failed:', e.message); }
  }

  async function fetchProgress() {
    const res = await fetch(CFG.WORKER_URL + '/progress', { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }

  window.WyckoffAPI = { loadWatchlist: loadWatchlist, triggerAnalysis: triggerAnalysis, fetchProgress: fetchProgress, launchLocalRunner: launchLocalRunner };
})();