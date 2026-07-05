(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // נווט שוק העבודה — בונה קורות חיים (P-51). טופס → תצוגה חיה בפורמט ישראלי
  // → ייצוא PDF (HtmlToPdf) / Word (mso) + מכתב מקדים + צ'קליסט ATS.
  // ⚠️ כלל הברזל של הסקיל מקודש: שדה ריק → [---למלא---], לעולם לא ממציא תוכן.
  // הפורמט הישראלי נאכף בקוד: אין תמונה/גיל/מצב-משפחתי, עמוד אחד, סדר הפוך.
  // טיוטה ב-localStorage('mahberet.jobnav') — אפס מפתחות Store.
  // ─────────────────────────────────────────────────────────────────────────
  const el = (t, a, k) => App.el(t, a || {}, k || []);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const KEY = 'mahberet.jobnav';

  const BLANK = () => ({
    name: '', city: '', phone: '', email: '', linkedin: '',
    summary: '',
    roles: [role()],
    eduDegree: '', eduInst: '', eduYears: '',
    milRole: '', milYears: '', milRank: '',
    skills: '',
    // cover letter
    clJob: '', clWhere: '', clFit: '', clWhy: ''
  });
  function role() { return { title: '', company: '', years: '', ach: '', sys: '' }; }

  function load() { try { return Object.assign(BLANK(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return BLANK(); } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  // כלל הברזל: ערך שהמשתמש מסר, או placeholder ברור — לעולם לא המצאה
  function ph(val, label) {
    const v = String(val || '').trim();
    return v ? esc(v) : '<span class="jn-ph">[---' + label + '---]</span>';
  }
  function lines(s) { return String(s || '').split(/\n/).map(x => x.trim()).filter(Boolean); }

  // ── בניית ה-HTML של הקו"ח (סדר הפוך = כפי שהוזן; התפקיד הראשון בטופס ראשון) ──
  function cvHtml(d) {
    const contact = [d.phone, d.email, d.linkedin, d.city].map(x => String(x || '').trim()).filter(Boolean);
    let h = '<div class="jn-cv-name">' + ph(d.name, 'שם מלא') + '</div>';
    h += '<div class="jn-cv-contact">' + (contact.length ? contact.map(esc).join(' &nbsp;|&nbsp; ') : ph('', 'טלפון | אימייל | עיר')) + '</div>';

    h += '<h3 class="jn-cv-h">תקציר מקצועי</h3>';
    h += '<p>' + ph(d.summary, 'למלא — 2-3 משפטים: מי אתה, היתרון שלך, מה מחפש') + '</p>';

    // ניסיון מקצועי — רק תפקידים שהוזן בהם משהו
    const roles = (d.roles || []).filter(r => (r.title || r.company || r.years || r.ach).trim && [r.title, r.company, r.years, r.ach].some(x => String(x || '').trim()));
    h += '<h3 class="jn-cv-h">ניסיון מקצועי</h3>';
    if (!roles.length) {
      h += '<p class="jn-ph">[---למלא לפחות תפקיד אחד: תפקיד, חברה, שנים והישגים---]</p>';
    } else {
      roles.forEach(r => {
        h += '<div class="jn-cv-role"><div class="jn-cv-role-h">' +
          ph(r.title, 'תפקיד') + ' &nbsp;|&nbsp; ' + ph(r.company, 'חברה') + ' &nbsp;|&nbsp; ' + ph(r.years, 'שנים') + '</div>';
        const ach = lines(r.ach);
        if (ach.length) h += '<ul>' + ach.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>';
        else h += '<ul><li class="jn-ph">[---הישג/אחריות — רצוי עם מספר---]</li></ul>';
        if (String(r.sys || '').trim()) h += '<div class="jn-cv-sys">מערכות/כלים: ' + esc(r.sys) + '</div>';
        h += '</div>';
      });
    }

    h += '<h3 class="jn-cv-h">השכלה</h3>';
    if ([d.eduDegree, d.eduInst, d.eduYears].some(x => String(x || '').trim()))
      h += '<div class="jn-cv-role-h">' + ph(d.eduDegree, 'תואר') + ' &nbsp;|&nbsp; ' + ph(d.eduInst, 'מוסד') + ' &nbsp;|&nbsp; ' + ph(d.eduYears, 'שנים') + '</div>';
    else h += '<p class="jn-ph">[---תואר, מוסד, שנת סיום---]</p>';

    if ([d.milRole, d.milYears, d.milRank].some(x => String(x || '').trim())) {
      h += '<h3 class="jn-cv-h">שירות צבאי</h3><div class="jn-cv-role-h">' +
        ph(d.milRole, 'תפקיד/יחידה') + ' &nbsp;|&nbsp; ' + ph(d.milYears, 'שנים') +
        (String(d.milRank || '').trim() ? ' &nbsp;|&nbsp; ' + esc(d.milRank) : '') + '</div>';
    }

    h += '<h3 class="jn-cv-h">כישורים</h3>';
    h += '<p>' + ph(d.skills, 'מערכות, תוכנות, שפות — רק מה שיש לך') + '</p>';
    return h;
  }

  function coverHtml(d) {
    const P = [];
    if (String(d.clJob || '').trim() || String(d.clWhere || '').trim())
      P.push('אני פונה בעניין משרת ' + ph(d.clJob, 'תפקיד') + (String(d.clWhere || '').trim() ? ' שראיתי ב' + esc(d.clWhere) : '') + '.');
    else P.push('<span class="jn-ph">[---פסקה 1: איזו משרה ואיפה מצאת אותה---]</span>');
    P.push(String(d.clFit || '').trim() ? esc(d.clFit) : '<span class="jn-ph">[---פסקה 2: למה אתה מתאים — הישגים ספציפיים---]</span>');
    P.push(String(d.clWhy || '').trim() ? esc(d.clWhy) : '<span class="jn-ph">[---פסקה 3: למה דווקא החברה הזו---]</span>');
    P.push('אשמח להיפגש לראיון. תודה על הזמן,<br>' + ph(d.name, 'שם'));
    return P.map(p => '<p>' + p + '</p>').join('');
  }

  // ── CSS עצמאי לייצוא (תואם לתצוגה החיה שב-jobnav.css) ────────────────────
  function exportCss() {
    return `.jn-cv{direction:rtl;font-family:Arial,'Heebo',sans-serif;font-size:11pt;line-height:1.5;color:#1a1a1a;max-width:100%;}
      .jn-cv-name{font-size:22pt;font-weight:700;color:#1F4E79;margin-bottom:2px;}
      .jn-cv-contact{font-size:10pt;color:#555;margin-bottom:12px;border-bottom:2px solid #1F4E79;padding-bottom:8px;}
      .jn-cv-h{font-size:12.5pt;color:#1F4E79;font-weight:700;margin:12px 0 4px;border-bottom:1px solid #d8d8d8;padding-bottom:2px;}
      .jn-cv-role{margin-bottom:8px;}
      .jn-cv-role-h{font-weight:700;font-size:11pt;}
      .jn-cv ul{margin:3px 18px 0 0;padding:0;}
      .jn-cv li{margin-bottom:2px;}
      .jn-cv-sys{font-size:10pt;color:#555;margin-top:2px;}
      .jn-cv p{margin:0 0 6px;}
      .jn-ph{color:#c0392b;font-style:italic;}`;
  }

  function download(blob, name) {
    const a = document.createElement('a'); const u = URL.createObjectURL(blob);
    a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000);
  }
  const safe = s => String(s || 'קורות-חיים').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);

  function exportWord(title, bodyHtml) {
    const doc = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40' lang="he" dir="rtl">
<head><meta charset='utf-8'><title>${esc(title)}</title>
<style>@page Section1{size:595.3pt 841.9pt;margin:1.5cm;}div.Section1{page:Section1;}body{direction:rtl;}${exportCss()}</style></head>
<body dir="rtl"><div class="Section1"><div class="jn-cv">${bodyHtml}</div></div></body></html>`;
    download(new Blob(['﻿', doc], { type: 'application/msword' }), safe(title) + '.doc');
    App.toast('📄 קובץ Word ירד להורדות');
  }
  async function exportPdf(title, bodyHtml) {
    if (!window.HtmlToPdf) { App.toast('מנוע ה-PDF לא נטען'); return; }
    await window.HtmlToPdf.generate(title, `<style>${exportCss()}</style><div class="jn-cv">${bodyHtml}</div>`, { fileName: safe(title) + '.pdf', dir: 'rtl' });
  }

  // ── ה-view של בונה הקו"ח ─────────────────────────────────────────────────
  function render(root) {
    const d = load();
    let mode = 'cv'; // 'cv' | 'cover'
    const prev = el('div', { class: 'jn-cv jn-prev-page' });
    const refresh = () => { save(d); prev.innerHTML = mode === 'cv' ? cvHtml(d) : coverHtml(d); };

    function field(label, key, ph2, ta) {
      const wrap = el('div', { class: 'ds-field' });
      wrap.appendChild(el('label', { class: 'ds-label' }, label));
      const inp = ta ? el('textarea', { class: 'ds-in', rows: '2', placeholder: ph2 || '' })
        : el('input', { class: 'ds-in', type: 'text', placeholder: ph2 || '' });
      inp.value = d[key] || '';
      inp.addEventListener('input', () => { d[key] = inp.value; refresh(); });
      wrap.appendChild(inp);
      return wrap;
    }
    function roleBlock(r, i) {
      const box = el('div', { class: 'jn-role-box' });
      box.appendChild(el('div', { class: 'jn-role-title' }, [
        el('b', {}, 'תפקיד ' + (i + 1) + (i === 0 ? ' (הנוכחי/האחרון)' : '')),
        d.roles.length > 1 ? el('button', { class: 'ds-items-x', title: 'הסר', onClick: () => { d.roles.splice(i, 1); rebuildRoles(); refresh(); } }, '✕') : null
      ]));
      [['title', 'תפקיד מדויק', 0], ['company', 'שם החברה (או "לא לציין")', 0], ['years', 'שנים (למשל 2020-2024)', 0],
       ['ach', 'הישגים — שורה לכל הישג. נסה מספרים: חסכתי? כמה? הגדלתי? באיזה אחוז?', 1], ['sys', 'מערכות/תוכנות', 0]]
        .forEach(([k, p, ta]) => {
          const w = el('div', { class: 'ds-field' });
          w.appendChild(el('label', { class: 'ds-label' }, ({ title: 'תפקיד', company: 'חברה', years: 'שנים', ach: 'הישגים', sys: 'מערכות/כלים' })[k]));
          const inp = ta ? el('textarea', { class: 'ds-in', rows: '2', placeholder: p }) : el('input', { class: 'ds-in', type: 'text', placeholder: p });
          inp.value = r[k] || '';
          inp.addEventListener('input', () => { r[k] = inp.value; refresh(); });
          w.appendChild(inp); box.appendChild(w);
        });
      return box;
    }
    const rolesWrap = el('div', {});
    function rebuildRoles() {
      rolesWrap.innerHTML = '';
      d.roles.forEach((r, i) => rolesWrap.appendChild(roleBlock(r, i)));
      if (d.roles.length < 4) rolesWrap.appendChild(el('button', { class: 'ds-add', onClick: () => { d.roles.push(role()); rebuildRoles(); } }, '+ תפקיד נוסף'));
    }
    rebuildRoles();

    const form = el('div', { class: 'ds-form' }, [
      el('div', { class: 'jn-form-sec' }, 'פרטי קשר (לכותרת)'),
      field('שם מלא *', 'name', 'שם ושם משפחה'),
      el('div', { class: 'jn-grid2' }, [field('עיר מגורים', 'city'), field('טלפון', 'phone')]),
      el('div', { class: 'jn-grid2' }, [field('אימייל', 'email'), field('LinkedIn (רשות)', 'linkedin')]),
      el('div', { class: 'jn-form-sec' }, 'תקציר מקצועי'),
      field('2-3 משפטים על עצמך', 'summary', 'מי אתה מקצועית, היתרון שלך, מה אתה מחפש', 1),
      el('div', { class: 'jn-form-sec' }, 'ניסיון מקצועי (עד 4 תפקידים)'),
      rolesWrap,
      el('div', { class: 'jn-form-sec' }, 'השכלה'),
      el('div', { class: 'jn-grid3' }, [field('תואר', 'eduDegree'), field('מוסד', 'eduInst'), field('שנת סיום', 'eduYears')]),
      el('div', { class: 'jn-form-sec' }, 'שירות צבאי (רשות)'),
      el('div', { class: 'jn-grid3' }, [field('תפקיד/יחידה', 'milRole'), field('שנים', 'milYears'), field('דרגה', 'milRank')]),
      el('div', { class: 'jn-form-sec' }, 'כישורים'),
      field('מערכות, תוכנות, שפות', 'skills', 'רק מה שיש לך — בלי להמציא', 1)
    ]);

    const coverForm = el('div', { class: 'ds-form', style: { display: 'none' } }, [
      el('div', { class: 'jn-form-sec' }, 'מכתב מקדים (3-4 פסקאות)'),
      el('div', { class: 'jn-grid2' }, [field('לאיזו משרה', 'clJob'), field('איפה מצאת', 'clWhere')]),
      field('פסקה 2 — למה אני מתאים (הישגים)', 'clFit', 'ישיר, תכלס, בלי הקדמות', 1),
      field('פסקה 3 — למה דווקא החברה הזו', 'clWhy', 'מחקר ספציפי על החברה', 1)
    ]);

    // מתגי מצב + ייצוא
    const modeCv = el('button', { class: 'ds-guide-tab on', onClick: () => { mode = 'cv'; modeCv.classList.add('on'); modeCover.classList.remove('on'); form.style.display = ''; coverForm.style.display = 'none'; refresh(); } }, '📄 קורות חיים');
    const modeCover = el('button', { class: 'ds-guide-tab', onClick: () => { mode = 'cover'; modeCover.classList.add('on'); modeCv.classList.remove('on'); form.style.display = 'none'; coverForm.style.display = ''; refresh(); } }, '✉️ מכתב מקדים');

    const title = () => mode === 'cv' ? ('קורות חיים - ' + (d.name || '')) : ('מכתב מקדים - ' + (d.name || ''));
    const bar = el('div', { class: 'ds-export-bar' }, [
      el('button', { class: 'btn', onClick: () => exportPdf(title(), mode === 'cv' ? cvHtml(d) : coverHtml(d)) }, '🖨️ PDF (מומלץ)'),
      el('button', { class: 'btn', onClick: () => exportWord(title(), mode === 'cv' ? cvHtml(d) : coverHtml(d)) }, '📄 Word'),
      el('button', { class: 'btn btn-ghost', onClick: () => { if (confirm('לנקות את כל השדות ולהתחיל מחדש?')) { const b = BLANK(); Object.keys(b).forEach(k => d[k] = b[k]); rebuildRoles(); refresh(); } } }, '🗑️ נקה')
    ]);

    const atsBox = el('details', { class: 'jn-ats' }, [
      el('summary', {}, '✅ בדיקת ATS — לפני ששולחים (לחץ לפתיחה)'),
      el('div', { class: 'jn-ats-body' }, window.JOBNAV_DATA.ATS.map(a => el('label', { class: 'jn-ats-row' }, [el('input', { type: 'checkbox' }), el('span', {}, a)])))
    ]);

    root.appendChild(el('div', { class: 'jn-cv-builder' }, [
      el('div', { class: 'jn-cv-note' }, '⚠️ הכלי לעולם לא ממציא — שדה שתשאיר ריק יופיע כ־[---למלא---] בקו"ח, כדי שתדע בדיוק מה חסר. הפורמט הישראלי נאכף: בלי תמונה, גיל או מצב משפחתי, עמוד אחד.'),
      el('div', { class: 'ds-guide-tabs', style: { border: 'none', padding: '0' } }, [modeCv, modeCover]),
      el('div', { class: 'jn-cv-grid' }, [
        el('div', {}, [form, coverForm, bar, atsBox]),
        el('div', { class: 'jn-prev-wrap' }, [el('div', { class: 'ds-label' }, 'תצוגה חיה — מה שרואים זה מה שמיוצא:'), prev])
      ])
    ]));
    refresh();
  }

  window.JobNavCV = { render };
})();
