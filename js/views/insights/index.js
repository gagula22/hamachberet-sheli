(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // לוח תובנות — ה-view (אחריות עצמאית).
  // Chart.js נטען עצל (vendor מקומי) רק בכניסה הראשונה למסך — דפוס ensureLibs
  // הקיים. ניהול חיים: אין unmount hook באפליקציה, לכן כל רינדור הורס את
  // הגרפים הקודמים, וה-subscribe בודק document.contains(root) ומתנתק לבד
  // כשה-view הוחלף. בנייה מחדש גם ב-themechange (צבעי הטוקנים משתנים).
  // ─────────────────────────────────────────────────────────────────────────

  function el(tag, attrs, kids) { return App.el(tag, attrs || {}, kids || []); }

  let _libP = null;
  function ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    if (_libP) return _libP;
    _libP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/chart.umd.min.js';
      s.async = true;
      s.onload = res;
      s.onerror = () => { _libP = null; rej(new Error('chart.js load failed')); };
      document.head.appendChild(s);
    });
    return _libP;
  }

  let _charts = [];
  let _unsub = null;
  let _rebuildT = null;

  function destroyCharts() {
    _charts.forEach(c => { try { c.destroy(); } catch (e) {} });
    _charts = [];
  }
  function detach() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    window.removeEventListener('themechange', onTheme);
    destroyCharts();
  }

  let _root = null;
  function onTheme() { scheduleRebuild(); }
  function scheduleRebuild() {
    clearTimeout(_rebuildT);
    _rebuildT = setTimeout(() => {
      if (!_root || !document.contains(_root)) { detach(); return; }
      build(_root);
    }, 150);
  }

  function build(grid) {
    destroyCharts();
    grid.innerHTML = '';
    (window.InsightsCharts ? InsightsCharts.builders : []).forEach(builder => {
      let spec;
      try { spec = builder(); } catch (e) { console.warn('insights builder failed:', e); return; }
      const card = el('div', { class: 'card ins-card' }, [el('h2', { class: 'ins-title' }, spec.title)]);
      if (spec.config) {
        const wrap = el('div', { class: 'ins-canvas-wrap' });
        const canvas = el('canvas');
        wrap.appendChild(canvas);
        card.appendChild(wrap);
        try {
          _charts.push(new Chart(canvas, spec.config));
        } catch (e) {
          console.warn('chart create failed:', e);
          card.appendChild(el('div', { class: 'ins-empty' }, 'שגיאה בציור הגרף.'));
        }
      } else {
        card.appendChild(el('div', { class: 'ins-empty' }, [
          el('div', {}, spec.emptyText),
          el('button', { class: 'ins-empty-btn', onClick: () => { location.hash = spec.route; } }, spec.routeLabel)
        ]));
      }
      grid.appendChild(card);
    });
  }

  function renderView(root) {
    detach();
    const grid = el('div', { class: 'ins-grid' });
    const loading = el('div', { class: 'ins-loading' }, 'טוען גרפים…');
    root.appendChild(loading);
    root.appendChild(grid);
    _root = grid;

    ensureChartJs().then(() => {
      loading.remove();
      if (!document.contains(grid)) return;
      build(grid);
      // רענון על שינוי נתונים — מתנתק לבד כשה-view מוחלף
      _unsub = Store.subscribe(() => {
        if (!document.contains(grid)) { detach(); return; }
        scheduleRebuild();
      });
      window.addEventListener('themechange', onTheme);
    }).catch(() => {
      loading.textContent = 'טעינת ספריית הגרפים נכשלה. רענן את הדף ונסה שוב.';
    });
  }

  if (window.App && App.register) App.register('insights', renderView);
})();
