// ==UserScript==
// @name         TradingView Draw Sync (layout mirror)
// @namespace    maoz.tv.drawsync
// @version      1.2
// @description  מעתיק אוטומטית ציורים ותיקיות מפריסת המקור ("פריסה שלי") לחלונות פריסת היעד ("אסטרטגיה 4 שעתי") — לפי המטבע של כל חלון. רץ בדפדפן, בלי תלות באפליקציה שבמחשב.
// @updateURL    https://gagula22.github.io/hamachberet-sheli/TV-Draw-Sync.user.js
// @downloadURL  https://gagula22.github.io/hamachberet-sheli/TV-Draw-Sync.user.js
// @match        https://*.tradingview.com/chart/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ─── config ────────────────────────────────────────────────────────────────
  const POLL_MS = 3000;
  // ⚠️ layouts are identified by their URL id — NEVER by chart count: during a
  // layout switch the app still reports the previous layout's charts for a moment.
  const SOURCE_ID = 'Xct1Lmad';       // "פריסה שלי"  (source — draw here)
  const TARGET_ID = '50zbpK6M';       // "אסטרטגיה 4 שעתי" (target — mirror)
  const TOP_RES = ['240', '60'];      // top windows of the target layout
  const BOT_RES = ['30', '15'];       // bottom windows
  const SRC_4H = '240';               // source chart that feeds top windows
  const SRC_15M = '15';               // source chart that feeds bottom windows
  const EMPTY_READS_BEFORE_DELETE = 5; // a still-loading chart reports 0 drawings
  const TAG = '[Draw-Sync]';

  const log = (...a) => console.log(TAG, ...a);
  const sha = async (s) => {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  };

  // ─── storage (IndexedDB — DTOs are megabytes, localStorage is too small) ───
  const DB = 'tvDrawSync', STORE = 'dto';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function idbGet(key) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      t.onsuccess = () => res(t.result || null); t.onerror = () => rej(t.error);
    });
  }
  async function idbSet(key, val) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
      t.onsuccess = () => res(); t.onerror = () => rej(t.error);
    });
  }
  const lsGet = k => { try { return localStorage.getItem('tvDrawSync:' + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem('tvDrawSync:' + k, v); } catch (e) {} };

  // ─── layout detection ─────────────────────────────────────────────────────
  function readCharts() {
    const api = window.TradingViewApi;
    if (!api) return null;
    let n; try { n = api.chartsCount(); } catch (e) { return null; }
    const out = [];
    for (let i = 0; i < n; i++) {
      try { out.push({ i, sym: String(api.chart(i).symbol()), res: String(api.chart(i).resolution()) }); }
      catch (e) { return null; }
    }
    return out;
  }
  let lastReading = null;
  function detect() {
    const charts = readCharts();
    if (!charts) { lastReading = null; return null; }
    const path = location.pathname;
    // settle guard: act only after two identical consecutive readings
    const sig = path + '|' + charts.map(c => c.sym + '@' + c.res).join(',');
    const stable = lastReading === sig;
    lastReading = sig;
    if (!stable) return { mode: 'settling' };

    if (path.includes(SOURCE_ID)) {
      const s4 = charts.find(c => c.res === SRC_4H), s15 = charts.find(c => c.res === SRC_15M);
      if (s4 && s15) return { mode: 'source', bands: { '4h': s4, '15m': s15 } };
      return { mode: 'other' };
    }
    if (path.includes(TARGET_ID)) {
      const tops = charts.filter(c => TOP_RES.includes(c.res));
      const bots = charts.filter(c => BOT_RES.includes(c.res));
      if (tops.length && bots.length) return { mode: 'target', tops, bots };
      return { mode: 'other' };
    }
    return { mode: 'other' };
  }

  // ─── export / apply (TradingView's own line-tools DTO) ────────────────────
  // cheap signature: shapes count + folder structure. Used to skip the expensive
  // full export when nothing actually changed.
  function quickSig(idx) {
    try {
      const c = window.TradingViewApi.chart(idx);
      const gm = window._exposed_chartWidgetCollection.getAll()[idx].model().model().lineToolsGroupModel();
      return String(c.getAllShapes().length) + '|' + JSON.stringify(gm.state());
    } catch (e) { return null; }
  }
  // ⚠️ hash only the meaningful content — serverUpdateTime changes on every export
  // and would make every cycle look like a change (endless re-mirroring).
  function fingerprint(json) {
    const raw = JSON.parse(json);
    const src = raw.sources.map(([id, v]) => id + ':' + JSON.stringify(v && v.state) + ':' + (v && v.groupId || '')).sort();
    const grp = raw.groups.map(([id, v]) => id + ':' + (v && v.name || '')).sort();
    return JSON.stringify({ src, grp });
  }

  async function exportChart(idx) {
    const c = window.TradingViewApi.chart(idx);
    const SYM = String(c.symbol());
    const dto = await Promise.resolve(c.getLineToolsState(1, undefined, true));
    if (!dto) return null;
    const src = (dto.sources instanceof Map ? [...dto.sources.entries()] : []).filter(([, v]) => v && v.symbol === SYM);
    const grp = (dto.groups instanceof Map ? [...dto.groups.entries()] : []).filter(([, v]) => v && v.symbol === SYM);
    const sIds = new Set(src.map(([k]) => k)), gIds = new Set(grp.map(([k]) => k));
    return JSON.stringify({
      clientId: dto.clientId,
      sources: src,
      groups: grp,
      lineToolsToValidate: (dto.lineToolsToValidate || []).filter(id => sIds.has(id)),
      groupsToValidate: (dto.groupsToValidate || []).filter(id => gIds.has(id)),
    });
  }

  async function applyToChart(idx, json, sym) {
    const c = window.TradingViewApi.chart(idx);
    if (String(c.symbol()) !== sym) return 'symbol changed';
    const raw = JSON.parse(json);
    try { c.removeAllShapes(); } catch (e) {}
    await new Promise(r => setTimeout(r, 600));
    if (raw.sources.length) {
      await Promise.resolve(c.applyLineToolsState({
        clientId: raw.clientId,
        sources: new Map(raw.sources),
        groups: new Map(raw.groups),
        lineToolsToValidate: raw.lineToolsToValidate,
        groupsToValidate: raw.groupsToValidate,
      }));
      await new Promise(r => setTimeout(r, 2500));
    }
    // exact mirror: locked drawings survive removeAllShapes — drop any leftover
    try {
      const want = new Set(raw.sources.map(e => String(e[0])));
      let extra = 0;
      for (const sh of c.getAllShapes()) {
        const id = String(sh.id);
        if (!want.has(id)) { try { c.removeEntity(id); extra++; } catch (e) {} }
      }
      if (extra) await new Promise(r => setTimeout(r, 800));
    } catch (e) {}
    // push to TradingView's server so every device sees it (and a reload keeps it)
    try {
      const sync = c.lineToolsSynchronizer();
      sync.invalidateAll();
      await new Promise(r => setTimeout(r, 400));
      await Promise.resolve(sync.flushPendingSavings());
      let waited = 0;
      while (waited < 30000 && sync.hasPendingSaveRequests()) { await new Promise(r => setTimeout(r, 1000)); waited += 1000; }
    } catch (e) {}
    return 'ok:' + c.getAllShapes().length;
  }

  function saveLayout() {
    try { window.TradingViewApi.getSaveChartService().saveChartSilently(); } catch (e) {}
  }

  // ─── main loop ────────────────────────────────────────────────────────────
  let busy = false;
  async function tick() {
    if (busy) return;
    const d = detect();
    if (!d || d.mode === 'other' || d.mode === 'settling') return;
    busy = true;
    try {
      if (d.mode === 'source') {
        for (const [band, ch] of Object.entries(d.bands)) {
          const key = band + '|' + ch.sym;
          const qs = quickSig(ch.i);
          if (qs && lsGet('qsig:' + key) === qs) continue;   // nothing changed
          const json = await exportChart(ch.i);
          if (!json) continue;
          const h = await sha(fingerprint(json));
          const prev = await idbGet(key);
          if (prev && prev.hash === h) { lsSet('zero:' + key, '0'); if (qs) lsSet('qsig:' + key, qs); continue; }
          // still-loading guard: don't let an empty read wipe the mirror
          const n = JSON.parse(json).sources.length;
          if (n === 0 && prev && prev.count > 0) {
            const z = (parseInt(lsGet('zero:' + key) || '0', 10) || 0) + 1;
            lsSet('zero:' + key, String(z));
            if (z < EMPTY_READS_BEFORE_DELETE) continue;
            log(`מאשר מחיקה מלאה ב-${key} (${z} קריאות ריקות)`);
          }
          lsSet('zero:' + key, '0');
          await idbSet(key, { hash: h, count: n, json, ts: Date.now() });
          if (qs) lsSet('qsig:' + key, qs);
          log(`📸 ${key}: ${n} ציורים`);
        }
      } else {
        const jobs = [...d.tops.map(c => ['4h', c]), ...d.bots.map(c => ['15m', c])];
        let changed = false;
        for (const [band, ch] of jobs) {
          const key = band + '|' + ch.sym;
          const rec = await idbGet(key);
          if (!rec || !rec.json) continue;                 // never captured → leave window alone
          const appliedKey = 'applied:' + location.pathname + ':' + key;
          if (lsGet(appliedKey) === rec.hash) continue;    // up to date
          if (rec.count === 0 && !lsGet(appliedKey)) continue;
          const res = await applyToChart(ch.i, rec.json, ch.sym);
          if (String(res).startsWith('ok:')) {
            lsSet(appliedKey, rec.hash);
            changed = true;
            log(`🔄 ${key} → חלון ${ch.i}: ${res.slice(3)} ציורים`);
          } else log(`⚠️ ${key}: ${res}`);
        }
        if (changed) { saveLayout(); log('💾 הפריסה נשמרה'); }
      }
    } catch (e) {
      log('⚠️', String(e && e.message || e).slice(0, 120));
    } finally { busy = false; }
  }

  log('פעיל — ממתין לפריסות (מקור: 4 צ׳ארטים 4h+15m | יעד: 6 צ׳ארטים)');
  setInterval(tick, POLL_MS);
})();
