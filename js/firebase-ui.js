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
  // ── Topbar sync button ──
  function renderSyncBtn() {
    let btn = document.getElementById('syncNowBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'syncNowBtn';
      btn.className = 'sync-now-btn';
      btn.title = 'סנכרן עכשיו';
      btn.textContent = '☁️';
      const topbarRight = document.querySelector('.topbar-right');
      const search = document.getElementById('globalSearch');
      if (topbarRight && search) topbarRight.insertBefore(btn, search.nextSibling);
      else if (topbarRight) topbarRight.appendChild(btn);
      else return;
    }
    btn.style.display = 'grid';
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('syncing')) return;
      btn.classList.add('syncing');
      btn.title = 'מסנכרן…';
      try {
        await Promise.race([window.FirebaseSync.syncAll(), new Promise(r => setTimeout(r, 8000))]);
        btn.title = 'סונכרן ✓';
        if (window.App) App.toast('☁️ סנכרון הושלם');
      } catch {
        btn.title = 'שגיאת סנכרון';
        if (window.App) App.toast('⚠️ סנכרון נכשל');
      }
      btn.classList.remove('syncing');
      setTimeout(() => { btn.title = 'סנכרן עכשיו'; }, 3000);
    });
  }

  // ── User bar in sidebar ──
  function renderUserBar(user) {
    const bar = document.getElementById('sidebarUserBar');
    if (!bar) return;
    bar.style.display = 'flex';
    const photo = user.photoURL
      ? `<img src="${user.photoURL}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">`
      : `<div style="width:32px;height:32px;border-radius:50%;background:var(--lavender);display:grid;place-items:center;font-size:16px;flex-shrink:0">👤</div>`;
    bar.innerHTML = `
      ${photo}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${user.displayName || user.email || 'משתמש'}
        </div>
        <div id="fb-sync-status" style="font-size:11px;color:var(--ink-mute);cursor:pointer"
             title="לחץ לסנכרן עכשיו">☁️ מסונכרן בזמן אמת</div>
      </div>
      <button id="fb-signout" title="התנתקות"
        style="font-size:20px;cursor:pointer;background:none;border:none;color:var(--ink-mute);padding:4px;line-height:1">⏏</button>`;

    document.getElementById('fb-sync-status').addEventListener('click', async () => {
      setStatus('saving');
      try {
        await window.FirebaseSync.syncAll();
        setStatus('saved');
        if (window.App) App.toast('סנכרון הושלם ✓');
      } catch { setStatus('error'); }
    });

    document.getElementById('fb-signout').addEventListener('click', () => {
      if (confirm('להתנתק מהחשבון?')) window.FirebaseSync.signOut().then(() => location.reload());
    });
  }

  window.FirebaseUI = {
    showOfflineBanner: showOfflineBanner, setStatus: setStatus,
    renderSyncBtn: renderSyncBtn, renderUserBar: renderUserBar
  };
})();