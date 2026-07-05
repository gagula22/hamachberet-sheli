(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מעבדת דשבורדים — רינדור (P-45). בונה את ה-DOM של הדשבורד מתוצר FDA.
  // Chart.js נטען עצל מ-js/vendor/chart.umd.min.js (אותו vendor של "תובנות").
  // מחזיק את מופעי הגרפים כדי להרוס לפני רינדור חוזר (אפס דליפות).
  // ─────────────────────────────────────────────────────────────────────────
  const el = (t, a, k) => App.el(t, a || {}, k || []);
  let _chartP = null, _charts = [];

  function ensureChart() {
    if (window.Chart) return Promise.resolve();
    if (_chartP) return _chartP;
    _chartP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/chart.umd.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Chart.js לא נטען'));
      document.head.appendChild(s);
    });
    return _chartP;
  }

  const PAL = {
    dark:   { name: 'כהה-כחול (ברירת מחדל)', bg: '#101E36', card: '#0C1830', line: '#1E3252', text: '#E6EEF9', mute: '#8FA6C6', series: ['#38C8E0', '#4C8DF5', '#E8B04B', '#7BDCB5', '#B39DF2', '#F28CA8'] },
    light:  { name: 'בהיר-רשמי',   bg: '#FFFFFF', card: '#F6F4EF', line: '#E2DACB', text: '#2A2620', mute: '#7A7264', series: ['#1F4E79', '#0E7C86', '#C07A2C', '#1E6F5C', '#4B3F9E', '#8C2F39'] },
    purple: { name: 'סגול',        bg: '#171226', card: '#221A38', line: '#3A2E58', text: '#EEE9FB', mute: '#A79ACB', series: ['#B39DF2', '#7C5CDB', '#E8B04B', '#5ED3C8', '#F28CA8', '#4C8DF5'] },
    green:  { name: 'ירוק',        bg: '#0E1F18', card: '#14291F', line: '#265240', text: '#E7F5EC', mute: '#8FBCA3', series: ['#5ECB8F', '#2E8B57', '#E8B04B', '#38C8E0', '#B39DF2', '#F28CA8'] },
    warm:   { name: 'חם',          bg: '#241512', card: '#2F1D18', line: '#54332A', text: '#F8EDE6', mute: '#C79D8A', series: ['#F2A65A', '#E0563F', '#E8CE4B', '#7BDCB5', '#38C8E0', '#B39DF2'] }
  };

  function destroyCharts() { _charts.forEach(c => { try { c.destroy(); } catch (e) {} }); _charts = []; }

  async function render(host, model, dash, palId, title) {
    destroyCharts();
    const p = PAL[palId] || PAL.dark;
    host.innerHTML = '';
    host.style.cssText = `background:${p.bg};color:${p.text};border-radius:16px;padding:20px;border:1px solid ${p.line}`;

    host.appendChild(el('div', { class: 'fd-dash-title' }, [
      el('b', {}, title || model.name),
      el('span', { class: 'fd-dash-sub', style: { color: p.mute } },
        model.kind === 'table' ? `${model.rows.length.toLocaleString('he-IL')} שורות · ${model.columns.length} עמודות${model.sheet ? ' · גיליון: ' + model.sheet : ''}` : 'ניתוח מסמך')
    ]));

    // KPIs
    const kpiRow = el('div', { class: 'fd-kpis' });
    dash.kpis.forEach((k, i) => kpiRow.appendChild(el('div', { class: 'fd-kpi', style: { background: p.card, borderColor: p.line } }, [
      el('div', { class: 'fd-kpi-v', style: { color: p.series[i % p.series.length] } }, String(k.v)),
      el('div', { class: 'fd-kpi-l', style: { color: p.mute } }, k.l)
    ])));
    host.appendChild(kpiRow);

    // Charts
    if (dash.charts.length) {
      try {
        await ensureChart();
        const grid = el('div', { class: 'fd-charts' });
        host.appendChild(grid);
        dash.charts.forEach((c, ci) => {
          const box = el('div', { class: 'fd-chart', style: { background: p.card, borderColor: p.line } });
          box.appendChild(el('div', { class: 'fd-chart-t', style: { color: p.mute } }, c.title));
          const cv = document.createElement('canvas');
          box.appendChild(cv); grid.appendChild(box);
          const common = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: c.type === 'doughnut', position: 'bottom', labels: { color: p.text, font: { family: 'Heebo' } } } }, scales: c.type === 'doughnut' ? {} : { x: { ticks: { color: p.mute }, grid: { color: p.line } }, y: { ticks: { color: p.mute }, grid: { color: p.line } } } };
          _charts.push(new Chart(cv, {
            type: c.type,
            data: { labels: c.labels, datasets: [{ data: c.data, backgroundColor: c.type === 'line' ? p.series[0] + '33' : c.labels.map((_, i) => p.series[i % p.series.length]), borderColor: p.series[ci % p.series.length], borderWidth: c.type === 'line' ? 2.5 : 1, fill: c.type === 'line', tension: .3 }] },
            options: common
          }));
        });
      } catch (e) { host.appendChild(el('div', { style: { color: p.mute } }, '⚠️ ספריית הגרפים לא נטענה — התובנות והמספרים למטה תקינים')); }
    }

    // Insights
    if (dash.insights && dash.insights.length) {
      const box = el('div', { class: 'fd-insights', style: { background: p.card, borderColor: p.line } },
        [el('div', { class: 'fd-sec-t', style: { color: p.mute } }, '💡 תובנות (מחושבות מהנתונים)')]
          .concat(dash.insights.map(i => el('div', { class: 'fd-insight' }, '· ' + i))));
      host.appendChild(box);
    }

    // Quotes (doc mode)
    if (dash.quotes && dash.quotes.length) {
      host.appendChild(el('div', { class: 'fd-insights', style: { background: p.card, borderColor: p.line } },
        [el('div', { class: 'fd-sec-t', style: { color: p.mute } }, '❝ ציטוטים מייצגים')]
          .concat(dash.quotes.map(q => el('div', { class: 'fd-quote', style: { borderColor: p.series[0] } }, q)))));
    }

    // Sample table
    if (dash.sample && dash.sample.length) {
      const keys = Object.keys(dash.sample[0]).slice(0, 6);
      const tbl = el('div', { class: 'fd-samplewrap' }, [el('table', { class: 'fd-sample' }, [
        el('thead', {}, el('tr', {}, keys.map(k => el('th', { style: { background: p.card, color: p.mute, borderColor: p.line } }, k)))),
        el('tbody', {}, dash.sample.map(r => el('tr', {}, keys.map(k => el('td', { style: { borderColor: p.line } }, String(r[k] ?? ''))))))
      ])]);
      host.appendChild(el('div', { class: 'fd-sec-t', style: { color: p.mute, marginTop: '14px' } }, 'דוגמת נתונים'));
      host.appendChild(tbl);
    }
  }

  // צילום הגרפים לתמונות (לייצוא עצמאי)
  function chartsAsImages() {
    return _charts.map(c => { try { return { title: c.options?._title || '', src: c.canvas.toDataURL('image/png') }; } catch (e) { return null; } }).filter(Boolean);
  }

  window.FDR = { render, destroyCharts, chartsAsImages, PAL };
})();
