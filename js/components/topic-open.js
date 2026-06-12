(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // TopicOpen — עוזר משותף זעיר: פתיחת נושא מחברת מכל מקום באתר.
  // משתמש ב-window._nbWikiClick שהמחברת חושפת לניווט קישורי-ויקי (נקבע
  // בזמן רינדור המחברת), עם המתנה קצרה אם המסך עוד נבנה. קריאה בלבד —
  // לא נוגע בקבצי המחברת. בשימוש: קישורים-חוזרים, מרכז ההדגשות, מפת
  // הקשרים, סריקת מסמך.
  // ─────────────────────────────────────────────────────────────────────────
  function open(topicId, name) {
    if (location.hash !== '#/notebook') location.hash = '#/notebook';
    var tries = 0;
    (function attempt() {
      if (window._nbWikiClick) { window._nbWikiClick(topicId, name || ''); return; }
      if (++tries < 25) setTimeout(attempt, 120);
    })();
  }
  window.TopicOpen = { open: open };
})();
