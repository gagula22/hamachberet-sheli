(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מעבדת דשבורדים — ייצוא HTML עצמאי (P-45). קובץ אחד, אפס תלות חיצונית:
  // הגרפים נצרבים כתמונות PNG (canvas.toDataURL), ה-CSS מוטמע. RTL מלא.
  // ─────────────────────────────────────────────────────────────────────────
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function exportHtml(model, dash, palId, title) {
    const p = window.FDR.PAL[palId] || window.FDR.PAL.dark;
    const imgs = window.FDR.chartsAsImages();
    const kpis = dash.kpis.map((k, i) =>
      `<div class="kpi"><div class="v" style="color:${p.series[i % p.series.length]}">${esc(k.v)}</div><div class="l">${esc(k.l)}</div></div>`).join('');
    const charts = imgs.map((im, i) =>
      `<div class="chart"><div class="ct">${esc((dash.charts[i] || {}).title || '')}</div><img src="${im.src}" alt="גרף"></div>`).join('');
    const insights = (dash.insights || []).map(i => `<div class="ins">· ${esc(i)}</div>`).join('');
    const quotes = (dash.quotes || []).map(q => `<div class="quote">${esc(q)}</div>`).join('');
    let sample = '';
    if (dash.sample && dash.sample.length) {
      const keys = Object.keys(dash.sample[0]).slice(0, 6);
      sample = `<div class="sect">דוגמת נתונים</div><div class="tw"><table><thead><tr>${keys.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>` +
        dash.sample.map(r => `<tr>${keys.map(k => `<td>${esc(r[k])}</td>`).join('')}</tr>`).join('') + `</tbody></table></div>`;
    }
    const doc = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{margin:0;background:${p.bg};color:${p.text};font-family:'Heebo','Segoe UI',Arial,sans-serif;padding:26px;direction:rtl}
.wrap{max-width:940px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px} .sub{color:${p.mute};font-size:13px;margin-bottom:20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.kpi{background:${p.card};border:1px solid ${p.line};border-radius:12px;padding:14px 16px}
.kpi .v{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
.kpi .l{font-size:12.5px;color:${p.mute};margin-top:2px}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:16px}
.chart{background:${p.card};border:1px solid ${p.line};border-radius:12px;padding:14px}
.chart img{width:100%;height:auto;display:block}
.ct{font-size:12px;color:${p.mute};margin-bottom:8px}
.box{background:${p.card};border:1px solid ${p.line};border-radius:12px;padding:14px 18px;margin-bottom:14px}
.sect{font-size:12px;color:${p.mute};letter-spacing:.05em;margin:0 0 8px}
.ins{margin-bottom:7px;line-height:1.6}
.quote{border-inline-start:3px solid ${p.series[0]};padding:4px 12px;margin-bottom:8px;color:${p.mute};font-style:italic}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:12.5px;min-width:480px}
th{background:${p.card};color:${p.mute};padding:7px 10px;text-align:right;border-bottom:1px solid ${p.line}}
td{padding:6px 10px;border-bottom:1px solid ${p.line}}
footer{color:${p.mute};font-size:11px;margin-top:22px;text-align:center}
</style></head><body><div class="wrap">
<h1>${esc(title)}</h1><div class="sub">${esc(model.name)} · הופק ${new Date().toLocaleString('he-IL')} · כל המספרים מחושבים מהקובץ בלבד</div>
<div class="kpis">${kpis}</div>
${charts ? `<div class="charts">${charts}</div>` : ''}
${insights ? `<div class="box"><div class="sect">💡 תובנות</div>${insights}</div>` : ''}
${quotes ? `<div class="box"><div class="sect">❝ ציטוטים</div>${quotes}</div>` : ''}
${sample}
<footer>הופק ע״י מעבדת הדשבורדים — המחברת שלי</footer>
</div></body></html>`;
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }));
    a.href = url; a.download = String(title || 'dashboard').replace(/[\\/:*?"<>|]/g, '-') + '.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    App.toast('🌐 הדשבורד ירד כקובץ HTML עצמאי');
  }

  window.FDE = { exportHtml };
})();
