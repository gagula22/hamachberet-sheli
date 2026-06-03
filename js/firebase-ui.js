(function () {
  // Firebase sync UI (non-auth). Pure DOM only: offline banner + status chip.
  // Extracted from firebase-sync.js; it calls these via window.FirebaseUI.
  // ── Offline banner ────────────────────────────────────────────────────────

  function showOfflineBanner() {
    if (document.getElementById('fb-offline-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'fb-offline-banner';
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9997;' +
      'background:#fff3cd;border-bottom:1px solid #ffc107;' +
      'padding:10px 20px;font-family:Heebo,Arial,sans-serif;direction:rtl;' +
      'font-size:13px;color:#856404;display:flex;align-items:center;gap:10px;';
    banner.innerHTML =
      '⚠️ <strong>הסנכרון בין מכשירים אינו פעיל</strong> — ' +
      'הנתונים נשמרים רק במכשיר זה. ' +
      '<button id="fb-retry-btn" style="margin-right:8px;padding:4px 10px;' +
      'background:#ffc107;border:none;border-radius:6px;cursor:pointer;' +
      'font-family:Heebo,Arial,sans-serif;font-size:12px;font-weight:600">' +
      'התחבר עכשיו</button>' +
      '<button id="fb-dismiss-banner" style="margin-right:auto;background:none;border:none;' +
      'cursor:pointer;font-size:16px;color:#856404">✕</button>';
    document.body.appendChild(banner);
    document.getElementById('fb-dismiss-banner').addEventListener('click', () => banner.remove());
    document.getElementById('fb-retry-btn').addEventListener('click', () => {
      banner.remove();
      window.FirebaseSync.setup();
    });
  }
  // ── Status display ────────────────────────────────────────────────────────

  function setStatus(state) {
    const el = document.getElementById('fb-sync-status');
    if (el) {
      if (state === 'saving') {
        el.textContent = '✏️ שומר…'; el.style.color = 'var(--ink-mute)';
      } else if (state === 'saved') {
        const t = new Date();
        el.textContent = `✓ נשמר • ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
        el.style.color = '';
      } else if (state === 'error') {
        el.textContent = '⚠️ לא הצליח לסנכרן'; el.style.color = '#e53e3e';
      }
    }
    if (window._nbSyncHook) { try { window._nbSyncHook(state); } catch {} }
  }
  window.FirebaseUI = { showOfflineBanner: showOfflineBanner, setStatus: setStatus };
})();