(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // לוח תובנות — בוני נתונים וקונפיגורציות Chart.js (אחריות עצמאית).
  // קריאה בלבד מה-Store; צבעים ופונט נקראים מטוקני ה-CSS בזמן בנייה,
  // כך שהגרפים נכונים אוטומטית גם במצב כהה (index.js בונה מחדש ב-themechange).
  // כל בונה מחזיר { title, emptyText, route, routeLabel, config|null }.
  // ─────────────────────────────────────────────────────────────────────────

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function baseFont() {
    return { family: cssVar('--font-body') || 'Heebo, sans-serif', size: 12 };
  }
  function lastDays(n) {
    const out = [], t = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - i);
      out.push(d);
    }
    return out;
  }
  function dk(d) { return Store.dateKey(d); }
  function dayLabel(d) { return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); }

  function commonOpts() {
    const ink = cssVar('--ink-soft') || '#6B6968';
    const line = cssVar('--line') || '#EEE6DC';
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { rtl: true, labels: { color: ink, font: baseFont() } },
        tooltip: { rtl: true, textDirection: 'rtl', titleFont: baseFont(), bodyFont: baseFont() }
      },
      scales: {
        x: { ticks: { color: ink, font: baseFont() }, grid: { color: line } },
        y: { ticks: { color: ink, font: baseFont() }, grid: { color: line } }
      }
    };
  }

  // ── 1. מגמת מצב רוח — 30 ימים ────────────────────────────────────────────
  const MOOD_EMOJI = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
  function moodChart() {
    const mood = Store.get('mood') || {};
    const ds = lastDays(30);
    const data = ds.map(d => mood[dk(d)] || null);
    const has = data.some(v => v != null);
    const opts = commonOpts();
    opts.scales.y.min = 0.5; opts.scales.y.max = 5.5;
    opts.scales.y.ticks.stepSize = 1;
    opts.scales.y.ticks.callback = v => MOOD_EMOJI[v] || '';
    opts.scales.y.ticks.font = { size: 16 };
    opts.plugins.legend.display = false;
    return {
      title: '💭 מגמת מצב רוח — 30 ימים',
      emptyText: 'עוד אין תיעודי מצב רוח. אחרי כמה ימים של תיעוד תראה כאן את המגמה.',
      route: '#/mood', routeLabel: 'פתח יומן מצב רוח',
      config: has ? {
        type: 'line',
        data: {
          labels: ds.map(dayLabel),
          datasets: [{
            data, spanGaps: true, tension: 0.35,
            borderColor: cssVar('--lavender-deep'), borderWidth: 2.5,
            pointBackgroundColor: cssVar('--lavender-deep'), pointRadius: 3.5
          }]
        },
        options: opts
      } : null
    };
  }

  // ── 2. התמדה בהרגלים — 8 שבועות ──────────────────────────────────────────
  function habitsChart() {
    const habits = Store.get('habits') || [];
    const labels = [], data = [];
    const today = new Date();
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    for (let w = 7; w >= 0; w--) {
      const start = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - w * 7);
      let done = 0, possible = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (d > today) break;
        possible += habits.length;
        habits.forEach(h => { if (h.log && h.log[dk(d)]) done++; });
      }
      labels.push(dayLabel(start));
      data.push(possible ? Math.round((done / possible) * 100) : 0);
    }
    const opts = commonOpts();
    opts.scales.y.min = 0; opts.scales.y.max = 100;
    opts.scales.y.ticks.callback = v => v + '%';
    opts.plugins.legend.display = false;
    return {
      title: '🌱 התמדה בהרגלים — 8 שבועות',
      emptyText: 'עוד אין הרגלים במעקב. הוסף הרגל וסמן ימים כדי לראות כאן את ההתמדה.',
      route: '#/habits', routeLabel: 'פתח מעקב הרגלים',
      config: habits.length ? {
        type: 'bar',
        data: {
          labels,
          datasets: [{ data, backgroundColor: cssVar('--sage-deep'), borderRadius: 6 }]
        },
        options: opts
      } : null
    };
  }

  // ── 3. הוצאות החודש לפי קטגוריה ──────────────────────────────────────────
  function budgetCategoryChart() {
    const month = Store.todayKey().slice(0, 7);
    const tx = (Store.get('transactions') || []).filter(t => t.type === 'exp' && (t.date || '').indexOf(month) === 0);
    const byCat = {};
    tx.forEach(t => { const c = t.category || 'אחר'; byCat[c] = (byCat[c] || 0) + (t.amount || 0); });
    const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
    const palette = ['--blush-deep', '--sky-deep', '--butter-deep', '--sage-deep', '--lavender-deep', '--peach', '--mint', '--ink-mute'].map(cssVar);
    const opts = commonOpts();
    delete opts.scales;
    opts.plugins.legend.position = 'right';
    return {
      title: '💰 הוצאות החודש לפי קטגוריה',
      emptyText: 'עוד אין הוצאות החודש. הוסף תנועות בתקציב כדי לראות את הפילוח.',
      route: '#/budget', routeLabel: 'פתח תקציב',
      config: cats.length ? {
        type: 'doughnut',
        data: {
          labels: cats,
          datasets: [{ data: cats.map(c => Math.round(byCat[c] * 100) / 100), backgroundColor: palette, borderWidth: 0 }]
        },
        options: opts
      } : null
    };
  }

  // ── 4. הכנסות מול הוצאות — 6 חודשים ──────────────────────────────────────
  function budgetTrendChart() {
    const tx = Store.get('transactions') || [];
    const labels = [], inc = [], exp = [];
    const now = new Date();
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      labels.push(d.toLocaleDateString('he-IL', { month: 'short' }));
      let i = 0, e = 0;
      tx.forEach(t => {
        if ((t.date || '').indexOf(key) === 0) {
          if (t.type === 'inc') i += (t.amount || 0); else e += (t.amount || 0);
        }
      });
      inc.push(Math.round(i)); exp.push(Math.round(e));
    }
    const has = inc.some(v => v) || exp.some(v => v);
    return {
      title: '📈 הכנסות מול הוצאות — 6 חודשים',
      emptyText: 'עוד אין תנועות בתקציב. אחרי כמה רישומים תראה כאן את המגמה.',
      route: '#/budget', routeLabel: 'פתח תקציב',
      config: has ? {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'הכנסות', data: inc, backgroundColor: cssVar('--sage-deep'), borderRadius: 5 },
            { label: 'הוצאות', data: exp, backgroundColor: cssVar('--blush-deep'), borderRadius: 5 }
          ]
        },
        options: commonOpts()
      } : null
    };
  }

  // ── 5. מים ושינה — 14 ימים ───────────────────────────────────────────────
  function waterSleepChart() {
    const water = Store.get('water') || {};
    const sleep = Store.get('sleep') || {};
    const ds = lastDays(14);
    const w = ds.map(d => water[dk(d)] || 0);
    const s = ds.map(d => sleep[dk(d)] != null ? sleep[dk(d)] : null);
    const has = w.some(v => v) || s.some(v => v != null);
    const opts = commonOpts();
    opts.scales.y.min = 0; opts.scales.y.max = 8;
    opts.scales.y.title = { display: true, text: 'כוסות מים', color: cssVar('--ink-mute'), font: baseFont() };
    opts.scales.y2 = {
      position: 'left', min: 0, max: 12,
      ticks: { color: cssVar('--ink-soft'), font: baseFont() },
      grid: { drawOnChartArea: false },
      title: { display: true, text: 'שעות שינה', color: cssVar('--ink-mute'), font: baseFont() }
    };
    return {
      title: '💧 מים ושינה — 14 ימים',
      emptyText: 'עוד אין נתוני שתייה ושינה. עדכן אותם מדי יום כדי לראות כאן את התמונה.',
      route: '#/water', routeLabel: 'פתח שתייה ושינה',
      config: has ? {
        type: 'bar',
        data: {
          labels: ds.map(dayLabel),
          datasets: [
            { label: 'מים (כוסות)', data: w, backgroundColor: cssVar('--sky-deep'), borderRadius: 4, yAxisID: 'y' },
            { label: 'שינה (שעות)', data: s, type: 'line', spanGaps: true, tension: 0.3, borderColor: cssVar('--lavender-deep'), borderWidth: 2.5, pointRadius: 3, yAxisID: 'y2' }
          ]
        },
        options: opts
      } : null
    };
  }

  window.InsightsCharts = {
    builders: [moodChart, habitsChart, budgetCategoryChart, budgetTrendChart, waterSleepChart]
  };
})();
