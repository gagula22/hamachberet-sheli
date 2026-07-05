(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מעבדת דשבורדים — מנוע ניתוח (P-45). פונקציות טהורות, אפס DOM.
  // מהמודל של extract.js: הצעת זוויות אמיתיות (התחליף ל-LLM: המשתמש בוחר
  // זווית שקיימת בנתונים), ובניית דשבורד: KPIs / charts / תובנות-מחוקים.
  // עיקרון הסקיל: אף מספר לא מומצא — הכל מחושב מהשורות עצמן.
  // ─────────────────────────────────────────────────────────────────────────
  const X = window.FDX;
  const fmt = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e4 ? Math.round(n).toLocaleString('he-IL') : a >= 100 ? Math.round(n).toLocaleString('he-IL') : (Math.round(n * 100) / 100).toLocaleString('he-IL'); };
  const sum = a => a.reduce((s, v) => s + v, 0);

  const cols = (m, t) => m.columns.filter(c => c.type === t).map(c => c.key);

  // ── הצעת זוויות מיקוד — רק שילובים שקיימים בפועל בנתונים ─────────────────
  function suggestAngles(model) {
    if (model.kind !== 'table') return [{ id: 'doc', label: 'ניתוח מסמך: נושאים, מספרים וציטוטים', num: null, cat: null }];
    const nums = cols(model, 'number'), cats = cols(model, 'category'), dates = cols(model, 'date');
    const out = [];
    nums.slice(0, 2).forEach(n => {
      cats.slice(0, 2).forEach(c => out.push({ id: `s_${n}_${c}`, label: `${n} לפי ${c}`, num: n, cat: c, date: dates[0] || null }));
      if (dates[0]) out.push({ id: `t_${n}`, label: `מגמת ${n} לאורך זמן (${dates[0]})`, num: n, cat: cats[0] || null, date: dates[0], trendFocus: true });
    });
    if (!out.length && nums.length) out.push({ id: 'n0', label: `סיכום ${nums[0]}`, num: nums[0], cat: cats[0] || null, date: dates[0] || null });
    if (!out.length && cats.length) out.push({ id: 'c0', label: `פילוח לפי ${cats[0]}`, num: null, cat: cats[0], date: null });
    if (!out.length) out.push({ id: 'raw', label: 'סקירה כללית של הקובץ', num: null, cat: null, date: null });
    return out.slice(0, 4);
  }

  // ── דשבורד לטבלה ─────────────────────────────────────────────────────────
  function tableDash(model, angle) {
    const rows = model.rows;
    const numK = angle.num, catK = angle.cat, dateK = angle.date;
    const kpis = [], charts = [], insights = [];
    kpis.push({ v: rows.length.toLocaleString('he-IL'), l: 'שורות נותחו' });

    let nums = [];
    if (numK) {
      nums = rows.map(r => r[numK]).filter(X.isNumLike).map(X.toNum);
      const total = sum(nums), avg = nums.length ? total / nums.length : 0;
      kpis.push({ v: fmt(total), l: 'סה״כ ' + numK });
      kpis.push({ v: fmt(avg), l: 'ממוצע ' + numK });
      // חריגים: מעל 2 סטיות תקן
      const sd = Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / (nums.length || 1));
      const outliers = nums.filter(v => Math.abs(v - avg) > 2 * sd).length;
      if (outliers) insights.push(`נמצאו ${outliers} ערכים חריגים ב"${numK}" (מעל 2 סטיות-תקן מהממוצע ${fmt(avg)}) — שווה בדיקה פרטנית.`);
    }

    if (catK) {
      const byCat = {};
      rows.forEach(r => {
        const c = String(r[catK] || '(ריק)');
        byCat[c] = (byCat[c] || 0) + (numK && X.isNumLike(r[numK]) ? X.toNum(r[numK]) : 1);
      });
      const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      kpis.push({ v: entries.length, l: 'קטגוריות ' + catK });
      const top = entries.slice(0, 8);
      charts.push({ type: 'bar', title: (numK ? numK : 'כמות') + ' לפי ' + catK, labels: top.map(e => e[0]), data: top.map(e => Math.round(e[1] * 100) / 100) });
      const totalAll = sum(entries.map(e => e[1]));
      if (totalAll > 0) {
        charts.push({ type: 'doughnut', title: 'נתח ' + catK, labels: top.slice(0, 5).map(e => e[0]).concat(entries.length > 5 ? ['אחר'] : []), data: top.slice(0, 5).map(e => Math.round(e[1] / totalAll * 1000) / 10).concat(entries.length > 5 ? [Math.round((totalAll - sum(top.slice(0, 5).map(e => e[1]))) / totalAll * 1000) / 10] : []) });
        const share = Math.round(entries[0][1] / totalAll * 100);
        insights.push(`"${entries[0][0]}" מוביל ב-${catK} עם ${share}% מהסך (${fmt(entries[0][1])})${entries[1] ? `; אחריו "${entries[1][0]}" עם ${Math.round(entries[1][1] / totalAll * 100)}%` : ''}.`);
        if (share >= 50) insights.push(`ריכוזיות גבוהה: קטגוריה אחת מחזיקה מעל מחצית מהסך — תלות שכדאי להיות מודעים אליה.`);
        const tail = entries.filter(e => e[1] / totalAll < 0.03).length;
        if (tail >= 3) insights.push(`זנב ארוך: ${tail} קטגוריות תורמות פחות מ-3% כל אחת — מועמדות לאיחוד/מיקוד.`);
      }
    }

    if (dateK) {
      const byPeriod = {};
      rows.forEach(r => {
        const d = X.parseDate(r[dateK]); if (!d) return;
        const p = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        byPeriod[p] = (byPeriod[p] || 0) + (numK && X.isNumLike(r[numK]) ? X.toNum(r[numK]) : 1);
      });
      const periods = Object.keys(byPeriod).sort();
      if (periods.length >= 2) {
        charts.push({ type: 'line', title: (numK || 'כמות') + ' לפי חודש', labels: periods, data: periods.map(p => Math.round(byPeriod[p] * 100) / 100) });
        const first = byPeriod[periods[0]], last = byPeriod[periods[periods.length - 1]];
        if (first > 0) {
          const g = Math.round((last - first) / first * 100);
          insights.push(`מגמה בין ${periods[0]} ל-${periods[periods.length - 1]}: ${g >= 0 ? 'עלייה' : 'ירידה'} של ${Math.abs(g)}% (${fmt(first)} → ${fmt(last)}).`);
        }
        const best = periods.reduce((a, b) => byPeriod[a] >= byPeriod[b] ? a : b);
        insights.push(`החודש החזק ביותר: ${best} עם ${fmt(byPeriod[best])}.`);
      }
    }

    if (!insights.length) insights.push('הקובץ חולץ במלואו; בחר זווית עם עמודה מספרית + קטגוריה כדי לקבל תובנות עומק.');
    return { kpis: kpis.slice(0, 4), charts: charts.slice(0, 3), insights: insights.slice(0, 6), sample: rows.slice(0, 8), columns: model.columns };
  }

  // ── דשבורד למסמך (בלי מספרים? נושאים/ציטוטים/מספרים-מהטקסט) ─────────────
  const STOP = new Set(('של את על עם לא זה זו אני הוא היא אנחנו הם אתם יש אין כל גם או אם כי מה מי איך למה בין עד אבל רק עוד יותר פחות אחרי לפני כאשר אשר לכל כמו שלא ולא כדי אל אלא אז שם פה הזה הזאת האלה שלנו שלהם שלו שלה and the of to in for with that this from are was were is a an be on it as at by we you they'.split(/\s+/)));
  function docDash(model) {
    const text = model.text || '';
    const words = text.split(/[^A-Za-zא-ת0-9%₪]+/).filter(Boolean);
    const sentences = text.split(/(?<=[.!?׃])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 5);
    const freq = {};
    words.forEach(w => { const k = w.trim(); if (k.length < 3 || STOP.has(k) || /^\d+$/.test(k)) return; freq[k] = (freq[k] || 0) + 1; });
    const topics = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const numbers = (text.match(/\d[\d,.]*\s*(?:%|₪|ש"ח|אלף|מיליון|NIS|\$)?/g) || []).filter(n => n.trim().length > 1).slice(0, 40);
    const quotes = sentences.filter(s => s.length >= 30 && s.length <= 200).slice(0, 6);
    const kpis = [
      { v: words.length.toLocaleString('he-IL'), l: 'מילים' },
      { v: sentences.length.toLocaleString('he-IL'), l: 'משפטים' },
      { v: numbers.length, l: 'נתונים מספריים אותרו' },
      { v: topics.length, l: 'נושאים מרכזיים' }
    ];
    const charts = topics.length ? [{ type: 'bar', title: 'המונחים החוזרים ביותר', labels: topics.map(t => t[0]), data: topics.map(t => t[1]) }] : [];
    const insights = [];
    if (topics.length) insights.push(`הנושא הדומיננטי במסמך: "${topics[0][0]}" (${topics[0][1]} אזכורים)${topics[1] ? `, ואחריו "${topics[1][0]}" (${topics[1][1]})` : ''}.`);
    if (numbers.length) insights.push(`המסמך מכיל ${numbers.length} נתונים מספריים — לדוגמה: ${numbers.slice(0, 4).join(' · ')}.`);
    if (quotes.length) insights.push('נבחרו ציטוטים מייצגים (מוצגים למטה) — כל אחד באורך משפט קריא.');
    return { kpis, charts, insights, quotes, sample: null, columns: [] };
  }

  function buildDash(model, angle) {
    return model.kind === 'table' ? tableDash(model, angle || {}) : docDash(model);
  }

  window.FDA = { suggestAngles, buildDash };
})();
