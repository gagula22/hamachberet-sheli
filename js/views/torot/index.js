/* P-39 · תורות, חוקים ומשפטים
 * View עצמאי לחלוטין: טוען מסמך HTML סטטי (js/views/torot/torot.html) בתוך iframe.
 * הבידוד המלא של ה-iframe מבטיח שה-CSS/JS של המסמך (חיפוש, כיווץ, מקבילות) אינם
 * מתנגשים בשום דבר באפליקציה — ולהיפך. אין namespace גלובלי ואין נגיעה ב-state.
 * עדכון תוכן = החלפת torot.html + הקפצת ?v ב-SRC כאן וב-index.html.
 */
(function () {
  const SRC = 'js/views/torot/torot.html?v=2';

  function render(view) {
    const wrap = document.createElement('div');
    wrap.className = 'torot-wrap';

    const frame = document.createElement('iframe');
    frame.className = 'torot-frame';
    frame.title = 'תורות, חוקים ומשפטים';
    frame.src = SRC;
    frame.loading = 'eager';
    frame.setAttribute('referrerpolicy', 'no-referrer');

    wrap.appendChild(frame);
    view.appendChild(wrap);
  }

  if (window.App && typeof App.register === 'function') {
    App.register('torot', render);
  }
})();
