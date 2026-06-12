# HANDOFF — המשך עבודה על "אתר משופר"

> מסמך מסירה לסוכן הבא. כל מה שצריך כדי להמשיך מהנקודה הזו בדיוק.
> נכתב: יוני 2026. כל העבודה מוקצה ב-git (היסטוריה נקייה, ראה למטה).

---

## 1. המשימה (מה המשתמש ביקש)
לשפר את אפליקציית "המחברת שלי" (gagula22.github.io/hamachberet-sheli) — **בלי לגעת באתר החי**:
1. לבדוק תקינות פונקציונלית של כל כפתור.
2. לייעל את הקוד שיעשה אותו דבר מהר/איכותי יותר — **בלי לשנות פונקציונליות**.
3. להוסיף בוט שמבין את תוכן האתר ועונה על שאלות.
4. הכול נבנה כ**אתר נפרד** בתיקייה חדשה "אתר משופר", נבדק מקומית; פריסה ל-GitHub רק בהמשך אם הבוט טוב.
5. לשמור על שיטת האחריויות (SoC); פיצ'ר חדש = אחריות עצמאית.

**החלטות שאושרו ע"י המשתמש:** מנוע הבוט = מקומי בלבד (פרטי, אפס העלאה); פריסה = שרת מקומי כעת, GitHub בהמשך; הבוט עונה גם על עזרה-באתר וגם על התוכן האישי.

## 2. איפה הכול
- **תיקיית העבודה:** `C:\Users\ACER\Documents\claude AI\אתר משופר\` ← עובדים **רק** כאן.
- **האתר החי (לא לגעת!):** `C:\Users\ACER\Documents\claude AI\מחברת\` (ריפו `gagula22/hamachberet-sheli`).
- **git:** לעותק יש git **משלו** (history נקי, לא קשור לריפו החי). Commit-per-change.
- **בדיקה מקומית:** הגדרת preview בשם `improved-site` ב-`C:\Users\ACER\Documents\claude AI\.claude\launch.json`
  → `python -m http.server 7799` → פותחים **http://localhost:7799**. (פורט 7799 בכוונה, כדי לא להתנגש ב-7788 של האתר החי.)

## 3. מה כבר נעשה (5 שלבים — כל אחד commit)
ראה ARCHITECTURE.md (מפת אחריות, כולל הבוט) ו-AUDIT.md (תוצאות הבדיקות) בתיקייה.
- **Phase 0:** עותק מלא + git חדש + **נטרול Firebase** בעותק (קריטי, ראה §5) + שרת 7799.
- **Phase 1:** ביקורת כל כפתור (AUDIT.md). 11/11 מסכים מרנדרים, CRUD אומת חי, 14/14 כלים נפתחים. הוסר קוד מת `_unused_insertImageFromFile` מ-`js/views/notebook/media.js`.
- **Phase 2:** ייעול `js/views/notebook/editor.js` — איחוד מאזיני keyup/mouseup כפולים ל-`_syncToolbarState` סינכרוני; debounce של 120ms לספירת המילים. התנהגות זהה, אומת.
- **Phase 3:** הבוט — אחריות עצמאית חדשה (ראה §4).
- **Phase 4:** אימות סופי — 12 מסכים, הבוט בניווט+דשבורד+FAB, אפס שגיאות קונסול.
- **+ DEPLOY_CHECKLIST.md** — תזכורת קריטית להעלאה (§5).

## 4. ארכיטקטורת הבוט (האחריות החדשה)
תיקייה: `js/views/assistant/` + `css/features/assistant.css`. 100% מקומי, **קריאה-בלבד** (קורא `Store.get`, אף פעם לא כותב, אף פעם לא רשת).
- `knowledge.js` → `window.AsstKnowledge` — מערך רשומות ידע-עזרה (keys/q/a/route) על כל פיצ'ר. **כאן מוסיפים ידע חדש.**
- `engine.js` → `window.AsstEngine` — `tokenize` (טוקנייזר עברי, מנרמל אותיות סופיות + ניקוד), `index`/`searchContent` (אינדוקס מסמכים מ-notes/topics/todos/goals/transactions/habits + דירוג), `computed` (תשובות מחושבות: הוצאות/הכנסות/יתרה החודש, משימות פתוחות, מים/מצב-רוח/הרגלים היום, מטרות), `answer(q)` (מתזמר: howto→עזרה, אחרת computed→content). **כאן מוסיפים סוגי-תשובות.**
- `ui.js` → `window.Assistant` — כפתור צף 💬 (FAB) + פאנל צ'אט + view מלא `App.register('assistant', ...)`. `Assistant.open()/close()/ask(q)`.
- חיווט: רשומה `{id:'assistant'}` ב-`js/app.js` SECTIONS; 3 תגיות `<script>` + `<link>` ל-CSS ב-`index.html`; `Store.subscribe` מאפס את האינדקס בשינוי נתונים.

**איך מרחיבים את הבוט:** ידע סטטי → knowledge.js; חישוב/חיפוש חדש → engine.js (`computed` או scoring); מראה/UX → ui.js + assistant.css. אל תיגע בקבצים אחרים.

## 5. ⚠️ הדבר הקריטי לפני העלאה לענן (תזכורת שהמשתמש ביקש לשמור)
בעותק **נוטרל Firebase** דרך הדגל `window.IMPROVED_SITE_SANDBOX = true;` ב-`index.html`, עם guards ב-`js/firebase-sync.js` (ב-`isConfigured()` וב-`setup()`). הסיבה: עותק שמוגש ב-HTTP עם אותו `firebase-config.js` **היה מסנכרן לנתונים החיים** אם מתחברים.
**לפני העלאה — חובה להחליט** (פירוט מלא ב-DEPLOY_CHECKLIST.md):
- (א) להסיר את הדגל → סנכרון לאותו פרויקט/נתונים של האתר החי; או
- (ב) פרויקט Firebase חדש + עדכון `firebase-config.js`, ואז להסיר את הדגל; או
- (ג) להשאיר את הדגל → מקומי בלבד.
ה-guards יכולים להישאר בקוד (פעילים רק כשהדגל דלוק) — מספיק לכבות שורה אחת ב-index.html.
**ולפרוס לריפו GitHub חדש — לא לריפו של האתר החי.**

## 6. מה פתוח (Phase 5 + אופציונלי)
- **Phase 5 (מושהה, מחכה לאישור המשתמש):** פריסת `אתר משופר/` ל-GitHub Pages נפרד. עבור על DEPLOY_CHECKLIST.md.
- אופציונלי אם יתבקש: עוד ייעולים (נשקלו ונדחו במכוון כדי לא לסכן פונקציונליות — ראה רשימת מועמדים ב-AUDIT.md/הערות); הרחבת ידע הבוט; שיפור דירוג החיפוש; חיבור החיפוש הגלובלי (#globalSearch) לבוט (כרגע עצמאי, לא נגעתי ב-app.js מעבר ל-SECTIONS).

## 7. כללי עבודה / gotchas (חשוב!)
- **לעבוד רק בתיקיית `אתר משופר`.** אפס שינוי באתר החי / בענן.
- **SoC:** כל שינוי בקובץ-הבעלים של האחריות (ראה ARCHITECTURE.md §2 טבלה). הבוט = אחריות מנותקת.
- **אחרי כל שינוי:** `node --check <file>` + bump `?v=N` של הקובץ ב-index.html + בדיקה ב-preview + commit נפרד.
- **commit messages:** בלי גרשיים כפולים (PowerShell 5.1 שובר). git כאן מוגדר `user.name=local user.email=local@local` (ל-commit להשתמש ב-`-c user.name=local -c user.email=local@local`).
- **אימות ב-preview:** `mcp__Claude_Preview__preview_start` (name=`improved-site`) ואז `preview_eval` + `preview_snapshot`. **שים לב:** `preview_screenshot` נתקע (timeout) בחלון הזה — זו תקלת כלי, לא בעיית עמוד. משתמשים ב-snapshot (עץ נגישות) + eval (שיטת האימות המועדפת ממילא).
- **rAF נסתר:** `requestAnimationFrame` **לא נורה** כשטאב ה-preview מוסתר — לכן בייעול השתמשנו ב-`setTimeout` ולא ב-rAF. לזכור אם מייעלים עוד.
- **Store API מאומת:** `Store.get/set/subscribe/uid/todayKey/dateKey/ready/update`. `App.el(tag,attrs,children)` (תומך class/style-object/onX/html). ניווט: `location.hash='#/<id>'`. פתיחת הערה ספציפית: `sessionStorage.setItem('openNoteId', id)` ואז `#/notes`.

## 8. היסטוריית git (לעותק)
```
99337b5 Add DEPLOY_CHECKLIST.md
ab85076 Phase 4: docs + final clean-load verified
a3577a3 Phase 3: local assistant bot (own SoC responsibility)
7f213d0 Phase 2: optimize notebook editor hot path
dd1ccca Phase 1: button audit + remove dead code
9629521 Phase 0: fork + neutralize Firebase sandbox
```

## 9. זיכרון קבוע (אם הסוכן הבא הוא Claude עם אותו memory)
קובץ הזיכרון `improved-site-project.md` (באינדקס `MEMORY.md`) מסכם את הפרויקט + התזכורת. ראה גם `hamachberet-architecture.md`, `hamachberet-soc-workflow.md`.
