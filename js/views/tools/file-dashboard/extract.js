(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מעבדת דשבורדים — חילוץ (P-45). קובץ → מודל אחיד:
  //   טבלאי: { kind:'table', name, columns:[{key,type}], rows:[{...}] }
  //   מסמך:  { kind:'doc',   name, text }
  // Excel/CSV דרך SheetJS (vendor מקומי, CDN כגיבוי) · PDF דרך pdf.js הקיים ·
  // Word דרך mammoth הקיים · JSON/TXT/MD נייטיב. פונקציות טהורות + טעינה עצלה.
  // ─────────────────────────────────────────────────────────────────────────

  let _xlsxP = null;
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (_xlsxP) return _xlsxP;
    const load = src => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    _xlsxP = load('js/vendor/xlsx.full.min.js')
      .catch(() => load('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'));
    return _xlsxP;
  }

  // ── זיהוי טיפוס עמודה ────────────────────────────────────────────────────
  const isNumLike = v => v !== '' && v != null && isFinite(Number(String(v).replace(/[,₪$%\s]/g, '')));
  const toNum = v => Number(String(v).replace(/[,₪$%\s]/g, ''));
  function parseDate(v) {
    if (v instanceof Date) return v;
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/); // DD/MM/YYYY
    if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; const d = new Date(y, m[2] - 1, m[1]); if (!isNaN(d)) return d; }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);               // YYYY-MM-DD
    if (m) { const d = new Date(+m[1], m[2] - 1, +m[3]); if (!isNaN(d)) return d; }
    return null;
  }

  function typeColumns(rows) {
    const keys = Object.keys(rows[0] || {});
    return keys.map(key => {
      const vals = rows.map(r => r[key]).filter(v => v !== '' && v != null);
      if (!vals.length) return { key, type: 'text' };
      const nNum = vals.filter(isNumLike).length;
      const nDate = vals.filter(v => parseDate(v)).length;
      let type = 'text';
      if (nDate / vals.length > 0.7 && nNum / vals.length < 0.7) type = 'date';
      else if (nNum / vals.length > 0.7) type = 'number';
      else {
        const distinct = new Set(vals.map(String)).size;
        if (distinct <= Math.max(12, vals.length * 0.35)) type = 'category';
      }
      return { key, type };
    });
  }

  function rowsFromAoa(aoa) {
    const head = (aoa[0] || []).map((h, i) => String(h || '').trim() || ('עמודה ' + (i + 1)));
    return aoa.slice(1).filter(r => r.some(c => c !== '' && c != null))
      .map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i] != null ? r[i] : ''); return o; });
  }

  function parseCsv(text) {
    const delim = (text.split('\n')[0] || '').includes('\t') ? '\t' : ',';
    const rows = []; let cur = [''], inQ = false, ri = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else inQ = false; } else cur[cur.length - 1] += c; }
      else if (c === '"') inQ = true;
      else if (c === delim) cur.push('');
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; rows.push(cur); cur = ['']; }
      else cur[cur.length - 1] += c;
    }
    if (cur.length > 1 || cur[0] !== '') rows.push(cur);
    return rows;
  }

  async function pdfText(buf) {
    const pdfjs = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (!pdfjs) throw new Error('pdf.js לא נטען');
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc)
      pdfjs.GlobalWorkerOptions.workerSrc = 'js/vendor/pdfjs.worker.min.js';
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    let out = [];
    const maxPages = Math.min(doc.numPages, 60);
    for (let p = 1; p <= maxPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      out.push(tc.items.map(it => it.str).join(' '));
    }
    return out.join('\n');
  }

  // ── נקודת הכניסה ─────────────────────────────────────────────────────────
  async function extract(file) {
    const name = file.name || 'קובץ';
    const ext = (name.split('.').pop() || '').toLowerCase();

    if (['xlsx', 'xls', 'xlsm', 'csv', 'tsv'].includes(ext)) {
      let aoas = []; // [{sheet, aoa}]
      if (ext === 'csv' || ext === 'tsv') {
        const text = await file.text();
        aoas = [{ sheet: name, aoa: parseCsv(text) }];
      } else {
        await ensureXlsx();
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        aoas = wb.SheetNames.map(sn => ({ sheet: sn, aoa: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }) }));
      }
      // בוחרים את הגיליון הגדול ביותר כברירת מחדל; השאר נשמרים לבחירה
      const sheets = aoas.map(s => ({ sheet: s.sheet, rows: rowsFromAoa(s.aoa) })).filter(s => s.rows.length);
      if (!sheets.length) throw new Error('לא נמצאו שורות נתונים בקובץ');
      sheets.sort((a, b) => b.rows.length - a.rows.length);
      const main = sheets[0];
      // cap: קבצים ענקיים — דגימה (השורות הראשונות; אגרגציה נעשית ב-analyze)
      const rows = main.rows.slice(0, 20000);
      return { kind: 'table', name, sheet: main.sheet, sheets: sheets.map(s => s.sheet), allSheets: sheets, columns: typeColumns(rows), rows };
    }

    if (ext === 'json') {
      const j = JSON.parse(await file.text());
      const arr = Array.isArray(j) ? j : (Object.values(j).find(Array.isArray) || null);
      if (arr && arr.length && typeof arr[0] === 'object') {
        const rows = arr.slice(0, 20000).map(o => { const f = {}; Object.keys(o).forEach(k => f[k] = typeof o[k] === 'object' ? JSON.stringify(o[k]) : o[k]); return f; });
        return { kind: 'table', name, sheet: '', sheets: [], allSheets: [], columns: typeColumns(rows), rows };
      }
      return { kind: 'doc', name, text: JSON.stringify(j, null, 2).slice(0, 200000) };
    }

    if (ext === 'pdf') return { kind: 'doc', name, text: await pdfText(await file.arrayBuffer()) };

    if (ext === 'docx' || ext === 'doc') {
      if (!window.mammoth) throw new Error('mammoth לא נטען');
      const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { kind: 'doc', name, text: r.value || '' };
    }

    // txt / md / כל השאר — טקסט
    return { kind: 'doc', name, text: await file.text() };
  }

  // מעבר לגיליון אחר מאותו חילוץ
  function useSheet(model, sheetName) {
    const s = (model.allSheets || []).find(x => x.sheet === sheetName);
    if (!s) return model;
    const rows = s.rows.slice(0, 20000);
    return { ...model, sheet: s.sheet, columns: typeColumns(rows), rows };
  }

  window.FDX = { extract, useSheet, parseDate, toNum, isNumLike };
})();
