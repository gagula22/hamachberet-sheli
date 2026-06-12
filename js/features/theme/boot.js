(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // ערכת נושא — שלב boot (אחריות עצמאית, אפס תלויות, סינכרוני).
  // רץ ב-<head> לפני קישורי ה-CSS כדי שהערכה תחול לפני הציור הראשון (בלי הבזק).
  // קורא מראה מקומית שנכתבת ע"י window.Theme (js/features/theme/index.js);
  // ה-Store האסינכרוני מסונכרן מאוחר יותר שם.
  // ─────────────────────────────────────────────────────────────────────────
  try {
    var pref = JSON.parse(localStorage.getItem('mahberet.theme') || '{}');
    var mode = pref.mode || 'cream';
    if (mode === 'auto') {
      mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'cream';
    }
    if (mode === 'dark') document.documentElement.dataset.theme = 'dark';
    if (pref.fs && pref.fs !== 'm') document.documentElement.dataset.fs = pref.fs;
  } catch (e) { /* localStorage חסום? נשארים בערכה הבהירה */ }
})();
