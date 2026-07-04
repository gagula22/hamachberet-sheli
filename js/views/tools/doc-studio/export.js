(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סטודיו מסמכים — ייצוא. שלושה מסלולים:
  //  PDF  → המנוע המשותף המוכח window.HtmlToPdf (רינדור פאס-אחד, RTL בטוח)
  //  Word → אותו דפוס בדיוק כמו ייצוא המחברת (application/msword + mso)
  //  HTML → קובץ עצמאי עם ה-CSS מוטמע (נפתח בכל דפדפן)
  // אפס לוגיקת-תבניות כאן — מקבל bodyHtml+css מוכנים מ-templates.js.
  // ─────────────────────────────────────────────────────────────────────────

  function download(blob, fileName) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const safeName = s => String(s || 'מסמך').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);

  // ── PDF: דרך המנוע המשותף (טוען html2canvas+jsPDF עצל, מחלק לעמודים בבלוקים)
  async function exportPdf(title, css, bodyHtml) {
    if (!window.HtmlToPdf) { App.toast('מנוע ה-PDF לא נטען'); return; }
    const html = `<style>${css}</style><div class="ds-doc">${bodyHtml}</div>`;
    await HtmlToPdf.generate(title, html, { fileName: safeName(title) + '.pdf', dir: 'rtl' });
  }

  // ── Word: HTML-as-.doc עם הוראות MSO — הדפוס המוכח של notebook/export.js
  function exportWord(title, css, bodyHtml) {
    const doc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="he" dir="rtl">
<head><meta charset="utf-8"><title>${title}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: 21cm 29.7cm; margin: 1.5cm 1.5cm 1.5cm 1.5cm; mso-page-orientation: portrait; }
div.Section1 { page: Section1; }
body { direction: rtl; unicode-bidi: embed; }
${css}
.ds-doc { padding: 0; }
.ds-band { margin: 0 0 18px; }
.ds-sig { display: block; }
.ds-sig div { display: inline-block; width: 42%; margin-inline-end: 6%; }
</style></head>
<body><div class="Section1"><div class="ds-doc" dir="rtl">${bodyHtml}</div></div></body></html>`;
    download(new Blob(['﻿' + doc], { type: 'application/msword;charset=utf-8' }), safeName(title) + '.doc');
    App.toast('📄 קובץ Word ירד להורדות');
  }

  // ── HTML עצמאי: לשליחה במייל / פתיחה בכל דפדפן
  function exportHtml(title, css, bodyHtml) {
    const doc = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&family=Assistant:wght@400;700&family=Frank+Ruhl+Libre:wght@400;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#EEE9E0;padding:24px;display:flex;justify-content:center}
.ds-page{max-width:760px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.15)}
${css}</style></head>
<body><div class="ds-page"><div class="ds-doc">${bodyHtml}</div></div></body></html>`;
    download(new Blob([doc], { type: 'text/html;charset=utf-8' }), safeName(title) + '.html');
    App.toast('🌐 קובץ HTML ירד להורדות');
  }

  window.DS_EXPORT = { exportPdf, exportWord, exportHtml };
})();
