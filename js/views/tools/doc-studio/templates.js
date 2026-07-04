(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סטודיו מסמכים — נתונים טהורים: פלטות, גופנים, סכמות 8 התבניות ובוני
  // ה-HTML שלהן. אפס DOM חי ואפס תלות — רק פונקציות טהורות (data → HTML).
  // מבוסס על הסקיל hebrew-doc-studio (פלטות/שדות-חובה/ניסוחים/כללי מע"מ).
  // ─────────────────────────────────────────────────────────────────────────

  const PALETTES = [
    { id: 'navy',     name: 'כחול עסקי',        accent: '#1F4E79', soft: '#EAF0F7', use: 'ברירת מחדל, כל מסמך עסקי' },
    { id: 'teal',     name: 'טורקיז טכנולוגי',  accent: '#0E7C86', soft: '#E8F4F5', use: 'טק/מוצר, דפי מידע' },
    { id: 'indigo',   name: 'סגול פרימיום',     accent: '#4B3F9E', soft: '#EEECF7', use: 'שיווקי, מיתוג בולט' },
    { id: 'emerald',  name: 'ירוק כספי',        accent: '#1E6F5C', soft: '#E9F3F0', use: 'כספים: חשבוניות וקבלות' },
    { id: 'burgundy', name: 'בורדו פורמלי',     accent: '#8C2F39', soft: '#F7ECEE', use: 'חוזים ומסמכים משפטיים' },
    { id: 'charcoal', name: 'גרפיט מינימליסטי', accent: '#333333', soft: '#F0F0F0', use: 'דוחות, ניטרלי' }
  ];

  const FONTS = [
    { id: 'heebo',    name: 'Heebo',            css: "'Heebo','Segoe UI',Arial,sans-serif",              use: 'סאנס מודרני — ברירת מחדל' },
    { id: 'assistant',name: 'Assistant',         css: "'Assistant','Segoe UI',Arial,sans-serif",          use: 'סאנס נקי — עסקי' },
    { id: 'frank',    name: 'Frank Ruhl Libre',  css: "'Frank Ruhl Libre','David',Georgia,serif",          use: 'סריף פורמלי — חוזים/משפטי' }
  ];

  const VAT = 18; // אחוז המע"מ בישראל מ-2025
  // מודל "חשבוניות ישראל": סף מספר-הקצאה (לפני מע"מ). מ-1.6.2026 — 5,000 ₪.
  const ALLOCATION_THRESHOLD = 5000;

  // ── עזרי בנייה (HTML של גוף המסמך; העיצוב ב-baseCss) ─────────────────────
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nl2p = (s, cls) => String(s || '').split(/\n+/).filter(x => x.trim())
    .map(x => `<p${cls ? ` class="${cls}"` : ''}>${esc(x)}</p>`).join('');
  const lines = s => String(s || '').split(/\n/).map(x => x.trim()).filter(Boolean);
  const money = n => (isFinite(n) ? Number(n) : 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const band = (title, sub) => `<div class="ds-band"><div class="ds-band-t">${esc(title)}</div>${sub ? `<div class="ds-band-s">${esc(sub)}</div>` : ''}</div>`;
  const sig = labels => `<div class="ds-sig">${labels.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;

  function itemsTable(items, showTotals, vatMode) {
    const rows = (items || []).filter(it => (it.desc || '').trim());
    if (!rows.length) return { html: '', sub: 0, vat: 0, total: 0 };
    let sub = 0;
    const body = rows.map(it => {
      const qty = Number(it.qty) || 1, price = Number(it.price) || 0, line = qty * price;
      sub += line;
      return `<tr><td>${esc(it.desc)}</td><td class="num">${qty}</td><td class="num">${money(price)}</td><td class="num">${money(line)}</td></tr>`;
    }).join('');
    const vat = vatMode === 'none' ? 0 : sub * VAT / 100;
    const total = sub + vat;
    let html = `<table class="ds-table"><thead><tr><th>תיאור</th><th>כמות</th><th>מחיר ליח׳ (₪)</th><th>סה״כ (₪)</th></tr></thead><tbody>${body}</tbody></table>`;
    if (showTotals) {
      html += `<div class="ds-totals"><div>סכום ביניים: <b>${money(sub)} ₪</b></div>` +
        (vatMode === 'none'
          ? `<div class="ds-muted">עסקה פטורה ממע״מ / מע״מ 0</div>`
          : `<div>מע״מ ${VAT}%: <b>${money(vat)} ₪</b></div>`) +
        `<div class="ds-grand">סה״כ לתשלום: ${money(total)} ₪</div></div>`;
    }
    return { html, sub, vat, total };
  }

  // ── סכמות + בונים ─────────────────────────────────────────────────────────
  // סוגי שדות: t=טקסט, ta=רב-שורות, d=תאריך, n=מספר, sel=בחירה,
  // items=טבלת פריטים (תיאור/כמות/מחיר), הכל עם ברירות-מחדל ידידותיות.
  const today = () => new Date().toLocaleDateString('he-IL');

  const TEMPLATES = [
    // ═══ 1. הצעת מחיר ═══
    {
      id: 'quote', icon: '💼', title: 'הצעת מחיר', palette: 'navy', path: 'pdf',
      desc: 'פס כותרת, פירוט שירותים, טבלת תמחור, מע״מ, תוקף וחתימות',
      fields: [
        { k: 'bizName', t: 't', label: 'שם העסק', req: 1, ph: 'סטודיו אלף בע״מ' },
        { k: 'bizDetails', t: 't', label: 'פרטי העסק (עוסק/כתובת/טלפון)', ph: 'ע.מ 512345678 · תל אביב · 052-1234567' },
        { k: 'docNum', t: 't', label: 'מספר הצעה', def: () => '2026-' + String(Math.floor(Math.random() * 900) + 100) },
        { k: 'date', t: 't', label: 'תאריך', def: today },
        { k: 'client', t: 't', label: 'לכבוד (שם הלקוח)', req: 1, ph: 'אורית לוי — חברת דוגמה' },
        { k: 'intro', t: 'ta', label: 'פתיח קצר', ph: 'שמחים להגיש הצעת מחיר עבור…' },
        { k: 'items', t: 'items', label: 'פירוט שירותים ותמחור', req: 1 },
        { k: 'vatMode', t: 'sel', label: 'מע״מ', opts: [['plus', `להוסיף מע״מ ${VAT}%`], ['none', 'ללא מע״מ (פטור/עוסק פטור)']], def: () => 'plus' },
        { k: 'validity', t: 't', label: 'תוקף ההצעה', def: () => '30 יום' },
        { k: 'payTerms', t: 't', label: 'תנאי תשלום', def: () => 'שוטף +30' },
        { k: 'notes', t: 'ta', label: 'הערות (רשות)' }
      ],
      build(d) {
        const t = itemsTable(d.items, true, d.vatMode);
        return band('הצעת מחיר מס׳ ' + (d.docNum || ''), [d.bizName, d.bizDetails, d.date].filter(Boolean).join(' · '))
          + `<p class="ds-to">לכבוד: <b>${esc(d.client)}</b></p>`
          + nl2p(d.intro)
          + t.html
          + `<p class="ds-terms">תוקף ההצעה: ${esc(d.validity)} · תנאי תשלום: ${esc(d.payTerms)}</p>`
          + (d.notes ? nl2p(d.notes, 'ds-muted') : '')
          + sig(['המציע', 'המזמין — אישור ההצעה']);
      }
    },

    // ═══ 2. חוזה ═══
    {
      id: 'contract', icon: '⚖️', title: 'חוזה', palette: 'burgundy', path: 'word', font: 'frank',
      desc: 'מבוא (הואיל), סעיפים ממוספרים, ניסוחים משפטיים וחתימות',
      fields: [
        { k: 'title', t: 't', label: 'כותרת ההסכם', def: () => 'הסכם למתן שירותים' },
        { k: 'date', t: 't', label: 'תאריך חתימה', def: today },
        { k: 'partyA', t: 't', label: 'צד א׳ (הספק)', req: 1, ph: 'שם + ח.פ/ת.ז' },
        { k: 'partyB', t: 't', label: 'צד ב׳ (המזמין)', req: 1, ph: 'שם + ח.פ/ת.ז' },
        { k: 'whereasA', t: 't', label: 'הואיל ו… (רקע צד ב׳)', ph: 'המזמין מעוניין בקבלת שירותי…' },
        { k: 'whereasB', t: 't', label: 'והואיל ו… (רקע צד א׳)', ph: 'הספק בעל הידע והניסיון הנדרשים' },
        { k: 'scope', t: 'ta', label: 'היקף העבודה (שורה = סעיף)', req: 1, ph: 'אפיון תהליכים\nפיתוח MVP תוך 30 יום\nהדרכת צוות' },
        { k: 'payment', t: 'ta', label: 'תנאי תשלום', ph: 'תמורה כוללת של … ₪ בתוספת מע״מ, ב-3 תשלומים…' },
        { k: 'duration', t: 't', label: 'תקופת ההסכם', ph: 'מיום החתימה ועד השלמת העבודה' },
        { k: 'confidential', t: 'sel', label: 'סעיפי סודיות וקניין רוחני', opts: [['yes', 'לכלול (נוסח סטנדרטי)'], ['no', 'לא לכלול']], def: () => 'yes' },
        { k: 'extra', t: 'ta', label: 'סעיפים נוספים (רשות, שורה = סעיף)' }
      ],
      build(d) {
        let n = 0; const S = (h, body) => `<h3 class="ds-h">${++n}. ${esc(h)}</h3>${body}`;
        let html = `<div class="ds-center"><div class="ds-ctitle">${esc(d.title)}</div><div class="ds-muted">שנחתם ביום ${esc(d.date)}</div>
          <p>בין: <b>${esc(d.partyA)}</b> (להלן: "הספק") ובין: <b>${esc(d.partyB)}</b> (להלן: "המזמין")</p></div>`;
        if (d.whereasA) html += `<p><b>הואיל</b> ו${esc(d.whereasA)};</p>`;
        if (d.whereasB) html += `<p><b>והואיל</b> ו${esc(d.whereasB)};</p>`;
        html += `<p><b>הוסכם והותנה בין הצדדים כדלקמן:</b></p>`;
        html += S('מבוא', `<p>המבוא להסכם זה מהווה חלק בלתי נפרד ממנו.</p>`);
        html += S('היקף העבודה', `<ol class="ds-ol">${lines(d.scope).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`);
        if (d.payment) html += S('תנאי תשלום', nl2p(d.payment));
        if (d.duration) html += S('תקופת ההסכם', `<p>${esc(d.duration)}.</p>`);
        if (d.confidential === 'yes') {
          html += S('סודיות', `<p>כל צד מתחייב לשמור בסודיות מלאה כל מידע עסקי, טכני או מסחרי של הצד השני. מבלי לגרוע מכלליות האמור לעיל, התחייבות זו תעמוד בתוקפה גם לאחר סיום ההסכם.</p>`);
          html += S('קניין רוחני', `<p>למען הסר ספק, מלוא זכויות הקניין הרוחני בתוצרי העבודה יעברו למזמין עם השלמת מלוא התמורה.</p>`);
        }
        lines(d.extra).forEach(x => { html += S('סעיף נוסף', `<p>${esc(x)}</p>`); });
        html += S('יישוב סכסוכים', `<p>סמכות השיפוט הבלעדית בכל עניין הנוגע להסכם זה נתונה לבתי המשפט המוסמכים בישראל.</p>`);
        html += `<p class="ds-muted">ולראיה באו הצדדים על החתום:</p>` + sig(['הספק', 'המזמין']);
        return html;
      }
    },

    // ═══ 3. מכתב רשמי ═══
    {
      id: 'letter', icon: '✉️', title: 'מכתב רשמי', palette: 'indigo', path: 'both',
      desc: 'כותרת/לוגו, נמען והנדון, גוף מסודר וחתימה',
      fields: [
        { k: 'bizName', t: 't', label: 'שם העסק / השולח', req: 1 },
        { k: 'date', t: 't', label: 'תאריך', def: today },
        { k: 'recipient', t: 'ta', label: 'לכבוד (אפשר כמה שורות)', req: 1, ph: 'מר יעקב כהן\nמנכ״ל, חברת דוגמה' },
        { k: 'subject', t: 't', label: 'הנדון', req: 1 },
        { k: 'body', t: 'ta', label: 'גוף המכתב', req: 1, ph: 'פסקת פתיחה…\n\nעיקר הדברים…\n\nסיכום ופנייה לפעולה…' },
        { k: 'signName', t: 't', label: 'שם החותם', req: 1 },
        { k: 'signRole', t: 't', label: 'תפקיד' }
      ],
      build(d) {
        return `<div class="ds-letterhead"><span class="ds-logo"></span><b>${esc(d.bizName)}</b></div>
          <p class="ds-left">${esc(d.date)}</p>
          <p class="ds-to">לכבוד<br>${lines(d.recipient).map(esc).join('<br>')}</p>
          <p><b>הנדון: ${esc(d.subject)}</b></p>` + nl2p(d.body) +
          `<p class="ds-signoff">בכבוד רב,<br><b>${esc(d.signName)}</b>${d.signRole ? `<br><span class="ds-muted">${esc(d.signRole)}</span>` : ''}</p>`;
      }
    },

    // ═══ 4. דוח / סיכום ═══
    {
      id: 'report', icon: '📊', title: 'דוח / סיכום', palette: 'charcoal', path: 'both',
      desc: 'תקציר מנהלים, מקטעים (שורה שמתחילה ב-# הופכת לכותרת), מסקנות',
      fields: [
        { k: 'title', t: 't', label: 'כותרת הדוח', req: 1, ph: 'דוח רבעוני — Q2 2026' },
        { k: 'subtitle', t: 't', label: 'כותרת משנה', ph: 'הוכן עבור הנהלת החברה' },
        { k: 'exec', t: 'ta', label: 'תקציר מנהלים', req: 1 },
        { k: 'body', t: 'ta', label: 'גוף הדוח (שורה שמתחילה ב-# = כותרת מקטע)', ph: '# ממצאים מרכזיים\nטקסט…\n# ניתוח\nטקסט…' },
        { k: 'items', t: 'items', label: 'טבלת נתונים (רשות — תיאור/כמות/ערך)' },
        { k: 'conclusions', t: 'ta', label: 'מסקנות והמלצות' }
      ],
      build(d) {
        let html = band(d.title, d.subtitle);
        html += `<div class="ds-execbox"><h3 class="ds-h" style="margin-top:0">תקציר מנהלים</h3>${nl2p(d.exec)}</div>`;
        String(d.body || '').split(/\n/).forEach(line => {
          const s = line.trim(); if (!s) return;
          html += s.startsWith('#') ? `<h3 class="ds-h">${esc(s.replace(/^#+\s*/, ''))}</h3>` : `<p>${esc(s)}</p>`;
        });
        const t = itemsTable(d.items, false);
        if (t.html) html += t.html;
        if (d.conclusions) html += `<h3 class="ds-h">מסקנות והמלצות</h3>` + nl2p(d.conclusions);
        return html;
      }
    },

    // ═══ 5. דף מידע ═══
    {
      id: 'onepager', icon: '📄', title: 'דף מידע (One-Pager)', palette: 'teal', path: 'pdf',
      desc: 'פס כותרת בולט, 2–3 מקטעים קצרים, קריאה לפעולה',
      fields: [
        { k: 'title', t: 't', label: 'כותרת ראשית', req: 1 },
        { k: 'subtitle', t: 't', label: 'שורת משנה' },
        { k: 's1t', t: 't', label: 'מקטע 1 — כותרת', def: () => 'מה תקבלו' },
        { k: 's1', t: 'ta', label: 'מקטע 1 — תוכן', req: 1 },
        { k: 's2t', t: 't', label: 'מקטע 2 — כותרת', def: () => 'למי זה מתאים' },
        { k: 's2', t: 'ta', label: 'מקטע 2 — תוכן' },
        { k: 's3t', t: 't', label: 'מקטע 3 — כותרת (רשות)' },
        { k: 's3', t: 'ta', label: 'מקטע 3 — תוכן (רשות)' },
        { k: 'cta', t: 't', label: 'קריאה לפעולה / פרטי קשר', req: 1, ph: 'להרשמה: 052-1234567 · info@example.co.il' }
      ],
      build(d) {
        let html = band(d.title, d.subtitle);
        [[d.s1t, d.s1], [d.s2t, d.s2], [d.s3t, d.s3]].forEach(([h, c]) => {
          if ((c || '').trim()) html += `<h3 class="ds-h">◆ ${esc(h || '')}</h3>` + nl2p(c);
        });
        html += `<div class="ds-cta">${esc(d.cta)}</div>`;
        return html;
      }
    },

    // ═══ 6. חשבונית מס ═══
    {
      id: 'invoice', icon: '🧾', title: 'חשבונית מס', palette: 'emerald', path: 'pdf',
      desc: 'כל שדות החובה של רשות המסים, הפרדת מע״מ, ואזהרת מספר הקצאה',
      fields: [
        { k: 'bizName', t: 't', label: 'שם העסק (כרשום ברשות המסים)', req: 1 },
        { k: 'bizAddr', t: 't', label: 'כתובת העסק', req: 1 },
        { k: 'osek', t: 't', label: 'מספר עוסק מורשה (9 ספרות)', req: 1 },
        { k: 'docNum', t: 't', label: 'מספר חשבונית (רץ עוקב)', req: 1 },
        { k: 'date', t: 't', label: 'תאריך הנפקה', def: today },
        { k: 'client', t: 't', label: 'שם הלקוח', req: 1 },
        { k: 'clientId', t: 't', label: 'ת.ז / ח.פ הלקוח', req: 1 },
        { k: 'allocation', t: 't', label: 'מספר הקצאה (חובה מעל 5,000 ₪ לפני מע״מ)', ph: 'מרשות המסים' },
        { k: 'items', t: 'items', label: 'פירוט הפריטים', req: 1 },
        { k: 'vatMode', t: 'sel', label: 'מע״מ', opts: [['plus', `מע״מ ${VAT}%`], ['none', 'פטור (ייצוא/אילת וכו׳)']], def: () => 'plus' }
      ],
      build(d) {
        const t = itemsTable(d.items, true, d.vatMode);
        const needAlloc = t.sub >= ALLOCATION_THRESHOLD && d.vatMode !== 'none';
        let allocHtml = '';
        if ((d.allocation || '').trim()) allocHtml = `<div class="ds-alloc ok">מספר הקצאה: ${esc(d.allocation)} ✓</div>`;
        else if (needAlloc) allocHtml = `<div class="ds-alloc warn">⚠️ הסכום מעל ${ALLOCATION_THRESHOLD.toLocaleString('he-IL')} ₪ לפני מע״מ — נדרש מספר הקצאה מרשות המסים, אחרת הלקוח לא יוכל לקזז מס תשומות</div>`;
        return band('חשבונית מס מס׳ ' + (d.docNum || ''), [d.bizName, 'עוסק מורשה ' + (d.osek || ''), d.date].filter(Boolean).join(' · '))
          + `<p class="ds-to">לכבוד: <b>${esc(d.client)}</b> · ת.ז/ח.פ ${esc(d.clientId)}</p>`
          + `<p class="ds-muted">${esc(d.bizAddr)}</p>`
          + allocHtml + t.html
          + `<p class="ds-muted">מקור / העתק · הופק ${esc(d.date)}</p>`;
      }
    },

    // ═══ 7. קבלה ═══
    {
      id: 'receipt', icon: '🪙', title: 'קבלה', palette: 'emerald', path: 'pdf',
      desc: 'המסמך הקצר: מי שילם, כמה, איך ועל מה — עם אסמכתא',
      fields: [
        { k: 'bizName', t: 't', label: 'שם העסק', req: 1 },
        { k: 'osek', t: 't', label: 'מספר עוסק', req: 1 },
        { k: 'docNum', t: 't', label: 'מספר קבלה (רץ עוקב)', req: 1 },
        { k: 'date', t: 't', label: 'תאריך', def: today },
        { k: 'payer', t: 't', label: 'התקבל מאת', req: 1 },
        { k: 'amount', t: 'n', label: 'סכום שהתקבל (₪)', req: 1 },
        { k: 'method', t: 'sel', label: 'אמצעי תשלום', opts: [['transfer', 'העברה בנקאית'], ['credit', 'כרטיס אשראי'], ['check', 'צ׳ק'], ['cash', 'מזומן'], ['bit', 'ביט / פייבוקס']], def: () => 'transfer' },
        { k: 'reference', t: 't', label: 'אסמכתא (מס׳ צ׳ק / העברה)' },
        { k: 'forWhat', t: 't', label: 'עבור', ph: 'חשבונית מס 2026-118' }
      ],
      build(d) {
        const M = { transfer: 'העברה בנקאית', credit: 'כרטיס אשראי', check: 'צ׳ק', cash: 'מזומן', bit: 'ביט / פייבוקס' };
        return band('קבלה מס׳ ' + (d.docNum || ''), [d.bizName, 'עוסק ' + (d.osek || ''), d.date].filter(Boolean).join(' · '))
          + `<p class="ds-to">התקבל מאת: <b>${esc(d.payer)}</b></p>`
          + `<table class="ds-table ds-kv"><tbody>
              <tr><td>סכום שהתקבל</td><td class="num"><b>${money(d.amount)} ₪</b></td></tr>
              <tr><td>אמצעי תשלום</td><td>${M[d.method] || esc(d.method || '')}</td></tr>
              ${d.reference ? `<tr><td>אסמכתא</td><td>${esc(d.reference)}</td></tr>` : ''}
              ${d.forWhat ? `<tr><td>עבור</td><td>${esc(d.forWhat)}</td></tr>` : ''}
            </tbody></table>`
          + sig(['חתימה וחותמת']);
      }
    },

    // ═══ 8. פרוטוקול ═══
    {
      id: 'minutes', icon: '📋', title: 'פרוטוקול ישיבה', palette: 'navy', path: 'word',
      desc: 'משתתפים, סדר יום, החלטות ממוספרות וטבלת משימות עם אחראים',
      fields: [
        { k: 'title', t: 't', label: 'כותרת', def: () => 'פרוטוקול ישיבת צוות' },
        { k: 'date', t: 't', label: 'תאריך', def: today },
        { k: 'time', t: 't', label: 'שעה', ph: '10:00' },
        { k: 'location', t: 't', label: 'מקום', ph: 'חדר ישיבות / זום' },
        { k: 'attendees', t: 'ta', label: 'משתתפים (שורה = משתתף)', req: 1, ph: 'אורית לוי — יו״ר\nדנה כהן — מזכירה' },
        { k: 'absent', t: 'ta', label: 'נעדרים (רשות)' },
        { k: 'agenda', t: 'ta', label: 'סדר יום (שורה = נושא)', req: 1 },
        { k: 'discussion', t: 'ta', label: 'עיקרי הדיון' },
        { k: 'decisions', t: 'ta', label: 'החלטות (שורה = החלטה)', req: 1 },
        { k: 'tasks', t: 'items', label: 'משימות (תיאור / אחראי בעמודת כמות / יעד בעמודת מחיר)', itemsMode: 'tasks' },
        { k: 'next', t: 't', label: 'ישיבה הבאה (רשות)' },
        { k: 'chair', t: 't', label: 'יו״ר' }, { k: 'secretary', t: 't', label: 'מזכיר/ה' }
      ],
      build(d) {
        let html = band(d.title, [d.date, d.time, d.location].filter(Boolean).join(' · '));
        html += `<h3 class="ds-h">משתתפים</h3><p>${lines(d.attendees).map(esc).join(' · ')}</p>`;
        if (lines(d.absent).length) html += `<p class="ds-muted">נעדרים: ${lines(d.absent).map(esc).join(' · ')}</p>`;
        html += `<h3 class="ds-h">סדר יום</h3><ol class="ds-ol">${lines(d.agenda).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
        if (d.discussion) html += `<h3 class="ds-h">עיקרי הדיון</h3>` + nl2p(d.discussion);
        html += `<h3 class="ds-h">החלטות</h3><ol class="ds-ol">${lines(d.decisions).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
        const tasks = (d.tasks || []).filter(t => (t.desc || '').trim());
        if (tasks.length) {
          html += `<h3 class="ds-h">משימות</h3><table class="ds-table"><thead><tr><th>משימה</th><th>אחראי</th><th>יעד</th></tr></thead><tbody>` +
            tasks.map(t => `<tr><td>${esc(t.desc)}</td><td>${esc(t.qty)}</td><td>${esc(t.price)}</td></tr>`).join('') + `</tbody></table>`;
        }
        if (d.next) html += `<p>ישיבה הבאה: <b>${esc(d.next)}</b></p>`;
        return html + sig([d.chair ? 'יו״ר: ' + d.chair : 'יו״ר', d.secretary ? 'מזכיר/ה: ' + d.secretary : 'מזכיר/ה']);
      }
    }
  ];

  // ── CSS משותף לתצוגה ולייצוא (פרמטרי לפי פלטה+גופן) ─────────────────────
  function baseCss(palette, font) {
    const p = PALETTES.find(x => x.id === palette) || PALETTES[0];
    const f = FONTS.find(x => x.id === font) || FONTS[0];
    return `
      .ds-doc{direction:rtl;font-family:${f.css};font-size:13px;line-height:1.7;color:#1E1A16;background:#fff;padding:34px 38px;width:100%;box-sizing:border-box}
      .ds-doc p{margin:0 0 7px}
      .ds-band{background:${p.accent};color:#fff;margin:-34px -38px 18px;padding:16px 24px}
      .ds-band-t{font-size:21px;font-weight:800}
      .ds-band-s{font-size:11.5px;opacity:.9;margin-top:2px}
      .ds-h{color:${p.accent};font-size:14.5px;font-weight:800;margin:14px 0 5px}
      .ds-to{margin-bottom:10px}
      .ds-muted{color:#75695A;font-size:11.5px}
      .ds-left{text-align:left}
      .ds-center{text-align:center;margin-bottom:12px}
      .ds-ctitle{font-size:20px;font-weight:800}
      .ds-table{width:100%;border-collapse:collapse;margin:10px 0;table-layout:auto}
      .ds-table th{background:${p.accent};color:#fff;padding:7px 10px;text-align:right;font-weight:600;font-size:12px}
      .ds-table td{padding:7px 10px;border-bottom:1px solid #E8E0D2}
      .ds-table tbody tr:nth-child(even) td{background:${p.soft}}
      .ds-table .num{font-variant-numeric:tabular-nums;white-space:nowrap}
      .ds-kv td:first-child{font-weight:600;width:38%}
      .ds-totals{text-align:left;margin:8px 0 12px;font-size:13px}
      .ds-grand{font-size:16px;font-weight:800;color:${p.accent};margin-top:3px}
      .ds-terms{border-top:1px solid #E8E0D2;padding-top:8px;font-size:12px}
      .ds-sig{display:flex;gap:40px;margin-top:34px}
      .ds-sig div{flex:1;border-top:1px solid #8A7F70;padding-top:5px;font-size:11.5px;color:#5B5348;text-align:center}
      .ds-ol{margin:4px 24px 8px 0;padding:0}
      .ds-ol li{margin-bottom:4px}
      .ds-letterhead{display:flex;align-items:center;gap:9px;font-size:17px;border-bottom:2px solid ${p.accent};padding-bottom:9px;margin-bottom:14px}
      .ds-logo{width:17px;height:17px;border-radius:5px;background:${p.accent};display:inline-block}
      .ds-signoff{margin-top:22px}
      .ds-execbox{background:${p.soft};border-radius:8px;padding:12px 16px;margin-bottom:12px}
      .ds-cta{background:${p.accent};color:#fff;border-radius:8px;padding:11px 16px;text-align:center;font-weight:700;margin-top:16px}
      .ds-alloc{border-radius:6px;padding:7px 12px;font-size:12px;margin:6px 0;display:inline-block}
      .ds-alloc.ok{background:${p.soft};border:1px solid ${p.accent};color:${p.accent}}
      .ds-alloc.warn{background:#FBF3DC;border:1px dashed #C9A227;color:#7A6023}
    `;
  }

  window.DS_DATA = { PALETTES, FONTS, TEMPLATES, VAT, ALLOCATION_THRESHOLD, baseCss };
})();
