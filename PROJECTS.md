# PROJECTS — מפת מיני-פרויקטים של "המחברת שלי"

> **מסמך-העל לעבודה עם Claude Code / Cowork.** כל מיני-פרויקט כאן = אחריות אחת מ-ARCHITECTURE.md,
> עם גבולות קבצים מדויקים. שני סוכנים יכולים לעבוד על שני מיני-פרויקטים שונים **בלי להתנגש**,
> כל עוד מכבדים את "נקודות-המגע המשותפות" (ראה §0).
>
> **לפני כל עבודה:** קרא (1) את `UPDATES.md` — איפה עצרנו, (2) את הכרטיס של המיני-פרויקט כאן,
> (3) את הסעיף הרלוונטי ב-`ARCHITECTURE.md`. **בסיום כל עבודה:** עדכן `UPDATES.md` + את המסמך הזה
> (סטטוס/משימות) + את ARCHITECTURE.md אם השתנה משהו מבני. ראה פרוטוקול מלא ב-`UPDATES.md`.

עודכן: 5.7.2026

---

## §0. נקודות-מגע משותפות — הכללים למניעת התנגשות

שישה קבצים בלבד מותרים לנגיעה מחוץ לגבולות המיני-פרויקט (נגיעה = שורה/רשומה אחת, additive):

| קובץ משותף | מה מותר | סיכון התנגשות |
|---|---|---|
| `js/app.js` | שורת SECTIONS בלבד | נמוך — שורה נפרדת לכל view |
| `index.html` | תגיות `<script>`/`<link>` + הקפצת `?v=N` | **בינוני** — שני סוכנים במקביל = קונפליקט. עבודה טורית בלבד על index.html |
| `js/store-schema.js` | רשומת מפתח חדשה | נמוך |
| `js/firebase-sync.js` | עדכון מערכי האסרציה `sub`/`main` בלבד (יחד עם store-schema!) | נמוך |
| `js/views/stickers.js` | אריח לכלי חדש בלבד | נמוך |
| `js/views/assistant/knowledge.js` | רשומת HELP לפיצ'ר חדש | נמוך |

**כללי ברזל:**
1. אחריות אחת = תיקייה משלה + CSS משלה + namespace אחד על `window`. שינוי בנושא אחד לא נוגע בקוד של נושא אחר.
2. קומיט אחד לכל פיצ'ר/תיקון. `node --check` לכל JS לפני קומיט.
3. כל קובץ ששונה → הקפצת `?v=N` ב-index.html (ה-Service Worker מגיש ישן בלי זה — גם אם כבר הוקפץ באותה סשן!).
4. אימות חי לפני דחיפה (preview מקומי) + אפס שגיאות קונסול.
5. **אסור לעבוד על שני מיני-פרויקטים באותו קומיט.** במקביל (worktrees/סוכנים) — רק אם אין חפיפה בקבצים כולל נקודות-המגע.
6. state משתנה לא עובר בין קבצים; תקשורת רק דרך namespaces על `window`.

---

## §1. תחום ליבה ותשתית (CORE)

### P-01 · מעטפת וניתוב
- **בבעלות:** `js/app.js` (מלבד SECTIONS — כולו), `index.html` (מבנה), `sw.js`, `manifest.json`, `icons/`
- **מהות:** bootstrap, hash-router, `App.register`, `App.onCloudUpdate` (רינדור-מחדש כשענן נוחת + הגנת-עריכה + SELF_MANAGED_ROUTES), PWA.
- **סטטוס:** ✅ יציב (app v32+)
- **זהירות:** זהו הקובץ שהכי הרבה פרויקטים נוגעים בו — כל שינוי כאן מחייב בדיקת כל המסכים.

### P-02 · אחסון וסכימת נתונים
- **בבעלות:** `js/store.js`, `js/store-schema.js`
- **מהות:** IndexedDB/localStorage, state, ייצוא/ייבוא JSON, מקור-אמת יחיד לכל מפתחות ה-Store (default+sync+merge).
- **סטטוס:** ✅ יציב (store v20)
- **זהירות:** `Store.dateKey` הוא UTC — חישובי תאריך מחייבים עיגון `T12:00`.

### P-03 · סנכרון ענן Firebase
- **בבעלות:** `js/firebase-config.js`, `js/firebase-sync.js`, `js/firebase-ui.js`, `js/features/forcesync/`, `js/features/syncdiag/`, `js/features/imgfit/`
- **מהות:** login, onSnapshot + REST-get fallback (טלפון/Listen חסום), long-polling ‎`?lp=1`, merge union, באנר/סטטוס, אבחון 🔬, דחיסת מדיה >900KB, מגן אובדן-מדיה (תמונות+קבצים).
- **סטטוס:** ✅ הבעיה ההיסטורית ("טלפון עד שבוע 23") נסגרה (v34)
- **תיקון (6.7.2026, `bdcb8b4`, v=35):** קובץ מודבק "נעלם אחרי רענון" — ה-strip והמגן
  לא כיסו `data-content` של קבצים מצורפים (רק תמונות) → הנושא נחתך ל-60KB בענן והֵד-הענן
  הקטוע דרס את המקומי. `_stripBase64Images` + `_hasRealImage` הורחבו לכסות גם קבצים.
  ARCHITECTURE §6. ⚠️ אל תצמצמו בחזרה ל"תמונות בלבד".
- **⏳ באמצע (7.7.2026): מעבר בקאנד `my-notebook-b5229` → `my-notebook-26ff5`.** העלאות קבצים ל-Storage נחסמות ב-CORS (האתר ב-GitHub Pages; ל-bucket אין כלל למקור `gagula22.github.io`), ו-b5229 לא נגיש בקונסול של המשתמש → מעבר לפרויקט שבבעלותו. **קובץ יחיד לשנות: `firebase-config.js`.** צ'ק-ליסט מלא + מצב + כללים + CORS: **`MIGRATION-b5229-to-26ff5.md`**. ARCHITECTURE §5א. ⚠️ אל תחליף קונפיג לפני ש-26ff5 מוקם מלא + הגיבוי ירד.
- **משימות פתוחות:**
  - [x] מחוון "נשמר" כוזב — כפתור 💾 עכשiv קורא `verifyCloud` (אימות-שרת) לפני "נשמר בענן" (`8840664`, P-11/editor.js v=51)
  - [ ] זיהוי אוטומטי של חסימת Firestore (ERR_BLOCKED_BY_CLIENT) + אזהרה למשתמש
  - [ ] שורת משתמש (אימייל/שם) נחתכת במובייל — CSS ב-firebase-ui
  - [ ] אימות ש-imgfit באמת מוריד דפים כבדים מתחת ל-900KB באיכות סבירה

### P-04 · גיבוי והעברת נתונים
- **בבעלות:** `js/components/data-transfer.js` (`window.DataBackup`), `js/features/autobackup/` (`window.AutoBackup`)
- **מהות:** ייצוא/ייבוא/הדבקת JSON; צילום יומי ל-IndexedDB `hamachberet-backups` (14 אחרונים) + שחזור בטוח.
- **סטטוס:** ✅ יציב

### P-05 · עיצוב גלובלי וערכות נושא
- **בבעלות:** `css/tokens.css`, `css/layout.css`, `css/components.css`, `js/features/theme/` (`window.Theme`), `css/features/theme-dark.css`
- **מהות:** טוקנים, grid, sidebar/topbar, מצב כהה (רק ב-theme-dark.css!), גודל גופן, boot סינכרוני בלי הבזק.
- **סטטוס:** ✅ יציב
- **זהירות (ARCHITECTURE §15):** `html{zoom:0.8}` + `--page-unzoom` חייבים להישאר מסונכרנים ב-layout.css; כל `100vh` חדש חייב `* var(--page-unzoom,1)`. דף העורך נשאר בהיר גם בכהה — בכוונה.

### P-06 · ניווט, קיבוץ ו-hub
- **בבעלות:** `js/components/sidebar.js`, `js/features/navmode/` (`window.NavMode`), `js/views/hub/`
- **מהות:** רינדור התפריט, קבוצות, צרורות, נתיבי `#/hub` ו-`#/bundle`, מצבי flat/group/hub.
- **עדכון (6.7.2026, `e594e04`, navmode v=5):** מ-2 ל-**5 קבוצות** — נוספו כסף-ותובנות,
  מסמכים-ויצירה, עוזרי-AI; רשימת-קריאה סופחה ל-ידע-ולכידה. הסרגל מ-~20 ל-12 פריטים.
  ARCHITECTURE §11. **להוסיף/לשנות קבוצה:** GROUPS ב-navmode + `group:'<id>'` ב-SECTIONS.
- **סטטוס:** ✅ יציב
- **הרחבה:** קבוצה חדשה = עריכת GROUPS ב-navmode + `group:'<id>'` ב-SECTIONS. זהו.

---

## §2. תחום המחברת (NOTEBOOK) — הלב של האתר

### P-10 · עץ נושאים ופריסה
- **בבעלות:** `js/views/notebook/index.js` (`window.nbTree/nbCore/nbActive`)
- **מהות:** עץ הנושאים, sidebar פנימי, layout, החלפת-פאנלים במובייל.
- **בוצע (7.7.2026, `a041e04`, index.js v=49 + app.js v=38):** תיקון **ריצוד + קפיצה-לראש** אחרי רענון/חזרה-למסך. זיכרון-גלילה: `render()` מחזיר את `window.scrollY` של הנושא הפעיל (הד-ענן/חזרה = שומר מקום; מעבר-נושא = ראש) + persist ל-`sessionStorage['nb.scroll']` לרענון (מזריע `lastScrollY`). ב-app.js (P-01): `viewIn` רק במעבר-מסך אמיתי (מבטל ריצוד). ARCHITECTURE §15. ⚠️ אזהרה זו הופרכה ב-15.7 — ראה השורה הבאה.
- **בוצע (15.7.2026, `ba4b6ca`, index.js v=50):** 🐞 **הבאג חזר — "חוזרים מחלון אחר/וורד והמיקום קופץ לראש".** השורש: תיקון ה-vh-unzoom (8.7) הפך את `max-height:100%` של `.nb-editor-col` (שיש לה `overflow-y:auto` מאז יוני) לקאפ אמיתי — **ציר-הגלילה עבר מהחלון לתוך העמודה**, וזיכרון-הגלילה נשאר על `window.scrollY` המת. התיקון: מעקב אחרי **שני** הגוללים (window למובייל + `.nb-editor-col` בדסקטופ, דרך מאזין scroll ב-capture ברמת document ששורד כל rebuild), persist של `{id, y, colY}` ל-`sessionStorage`, ושחזור שני הצירים אחרי כל render עם retries קצרים (תמונות גדלות ב-decode) שנעצרים כשהמשתמש גולל. ARCHITECTURE §15.7. ⚠️ **כלל:** כל שינוי overflow/height על `.nb-editor-col`/`.nb-layout` מחייב בדיקת זיכרון-גלילה.

### P-11 · עורך הטקסט
- **בבעלות:** `js/views/notebook/editor.js` (`window.nbEditor`)
- **מהות:** contenteditable, toolbar, undo/redo, טבלאות, שמירה-לענן (Ctrl+S).
- **משימות פתוחות:**
  - [ ] שינוי גופן גורף: סימון כל הטקסט + בחירת גודל עובד רק על פסקה בודדת
  - [ ] תמיכת מגע משופרת במחברת (מפת הדרכים)
- **זהירות (ARCHITECTURE §14 — חובה לקרוא):** מלכודת הבחירה. לחצני toolbar חייבים `preventDefault` על mousedown (כולל פופאפים שנפתחים ב-body!); לעולם לא לשחזר savedRange בעיוורון.

### P-12 · מדיה ותמונות
- **בבעלות:** `js/views/notebook/media.js` (`window.nbMedia`), `js/components/editable/` — `utils.js` (compressImage), `image.js`, `index.js` (`window.Editable*`), `js/features/cloud-files/` (`window.CloudFiles`)
- **מהות:** המשפך היחיד לכל תמונה באתר (מחברת/הערות/סקירה): הדבקה, figures, גרירה, ידיות-גודל, snap, מדיניות איכות. **קבצים מצורפים** (לא-תמונה): מאוחסנים ב-**Firestore מפוצל ל-chunks** (הנושא שומר `data-fs` בלבד → מסתנכרן מלא, זמין מכל מכשיר), עם נפילה ל-base64 מקומי אם לא-מחובר.
- **בוצע (14.7.2026, cloud-files v=4 · media v=54 · editor v=54):** ✅ **פתרון סופי להצמדת-קובץ-לענן.** הוחלף Storage (חסום CORS מ-github.io, לא נגיש לתיקון) ב-**אחסון Firestore מפוצל**: `users/{uid}/attachments/{id}` מטא + `parts/{i}` chunks (עוקף מגבלת 1MB/מסמך), מטא נכתב אחרון. הנושא שומר `data-fs="{id}"` קטן (בלי base64 → לא נחתך ע"י `_sizeSafeTopic`, חסין למגן-המדיה). `openAttachment`/`downloadAttachment` טוענים chunks על-פי-דרישה. תקרה `FS_MAX`=20MB. **מחוץ ל-Store/סכימה בכוונה** (כמו הקלטות-קול) — אין מפתח store-schema, אין אסרציה; כלל-ההרשאה `users/{uid}/{document=**}` מכסה. תאימות-לאחור: `data-url`/`data-content` ישנים עדיין נפתחים.
- **בוצע (15.7.2026, cloud-files v=5):** ⚡ **מהירות ואיכות.** chunks של 900KB (מהמקסימום הבטוח <1MB → פחות round-trips); כתיבה+קריאה של parts **במקביל** (CONCURRENCY=5, כמו תמלול-הקול); מחיקה = `writeBatch` אטומי יחיד. נמדד (mock עם latency): 5MB → 8 chunks, peak-concurrency 5, **2.2× מהיר מסדרתי**, byte-identical, מחיקה ב-batch אחד (9→0). אימות מלא: insert→open→download→remove + נפילת signed-out — אפס שגיאות.
- **בוצע (6.7.2026, `82c393c`, media v=49 + cloud-files v=1):** קובץ מצורף לענן (Storage) + תיקון פתיחה: Blob URL במקום data-URI-ב-iframe (שנכשל על קבצים גדולים = "טאב ריק").
- **בוצע (6.7.2026, `951ef0e`→`f70b19e`, media v=51 · editor v=53 · notebook.css v=51):** **כפתור הורדה ⬇ גלוי** בכל כרטיס קובץ → הורדה לתיקיית ההורדות (מקומי: Blob URL + `<a download>`; ענן: `<a download target=_blank>`). **לחיצה כפולה = פתיחה**. **כל האינטראקציות (⬇/×/dblclick) מואצלות על אלמנט העורך ב-editor.js — לא פר-כרטיס** → שורד רענון. ⚠️ **מלכודת שתוקנה:** חיווט פר-כרטיס עם `data-wired` דולף ל-body הנשמר וחוסם re-wire אחרי רענון (כפתורים מתים) — לכן **אסור לחזור לחיווט פר-כרטיס לכרטיסים שמסתנכרנים; להשתמש בהאצלה**. ⚠️ נתיב התמונות לא נגע.
- **בוצע (6.7.2026, `2f50aa7`, cloud-files v=2 · media v=52 · notebook.css v=52):** **אחוזי-התקדמות חיים בהעלאה** — `upload(file,id,onProgress)` מאזין ל-`UploadTask.state_changed` (bytesTransferred/totalBytes) וה-placeholder מציג "מעלה 45%…" עד ההחלפה בכרטיס-URL; `.file-uploading` מסגרת+אייקון פועם. ⚠️ **זמן ההעברה כבול-רוחב-פס** (גודל÷upstream) ולא ניתן להאצה בקוד — רק ההתקדמות נעשית גלויה. ההעלאה לא-חוסמת.
- **בוצע (6.7.2026, `ebc7042`, cloud-files v=3 · media v=53):** **כשל-מהיר בהעלאה תקועה.** ברירת המחדל `maxUploadRetryTime`=10 דק' גרמה ל"תקוע על 0%" כשההעלאה לא מצליחה להתחיל. תוקן: retry-times→20s + **שעון-תקיעה** (`CloudFiles.stallMs`=30s) שמבטל+דוחה `storage/stalled` אם אין תזוזת-בייטים (מתאפס על התקדמות אמיתית → לא מבטל העלאה איטית-אך-זזה); ה-toast מציג את קוד-השגיאה. ℹ️ **נתיב ההדבקה כבר מעלה ישירות ל-Storage (raw bytes, `data-url` בלבד) — אין base64; כפתור-סרגל לא יהיה מהיר יותר, רק UI.**
- **⚠️ תלות חיצונית:** אין יותר תלות ב-Storage/CORS. דורש רק את כלל-Firestore הקיים `match /users/{uid}/{document=**}` (רקורסיבי — כבר מכסה את `attachments/**`). קבצי-Storage ישנים (`data-url`) אם קיימים — עדיין נפתחים. **אסור לגעת בנתיב שמירת התמונות** (media.js insertImage/Editable) — הוא לא קשור לקבצים.

### P-13 · ייצוא מסמכים (Word/PDF)
- **בבעלות:** `js/views/notebook/export.js` (`window.nbExport`), `js/components/html-to-pdf.js` (`window.HtmlToPdf`)
- **מהות:** צינור exportDoc, טבלאות-עטיפה לתמונות, A4, scale אדפטיבי, fallback הדפסה.
- **תיקון קבוע (5.7.2026, `09a44a1`, export.js v=55):** תמונות ב-Word דרך **MHTML** במקום
  data-URI — סוף הבאג החוזר של "תמונה מקושרת שבורה" ב-Word. ראה ARCHITECTURE §6.
- **משימות פתוחות:**
  - [ ] תוכן ישן שהודבק מ-Word עדיין מיוצא ב-13pt — לכפות 11pt בייצוא
- **זהירות (ARCHITECTURE §6):** (1) רינדור PDF בפאס אחד עם windowWidth=680 — בלוק-בלוק שובר RTL.
  (2) ⚠️ תמונות ב-Word = MHTML בלבד — **אסור** להחזיר ל-`<img src="data:…">` (הרגרסיה החוזרת);
  לאמת בפתיחת ה-.doc ב-Word עצמו, לא בדפדפן.

### P-14 · עיצוב המחברת
- **בבעלות:** `css/features/notebook.css`
- **זהירות (ARCHITECTURE §15):** גובה המחברת נקבע בכלל `.main:has(.nb-layout)` בסקשן "Hide global topbar" — תיקוני גובה רק שם.

---

## §3. תחום יומן ומעקב יומי (DAILY)

### P-20 · יומן
- **בבעלות:** `js/views/calendar.js`, `daily.js`, `weekly.js`, `monthly.js`
- **מהות:** ניתוב `#/planner/*`, ציר-זמן יומי, drag-drop שבועי, לוח חודשי.
- **בוצע (5.7.2026, קומיט `5157453`):** בשבועי — כפתור 📅 על כל משימה מעביר ל**כל תאריך**
  (בורר-תאריכים נייטיבי, `showPicker`; value בפורמט `YYYY-MM-DD` = בדיוק `Store.dateKey`,
  אפס המרות). גרירה נשארה להזזה בתוך השבוע המוצג. CSS של `.pill-move` ב-`components.css`
  (ליד `.pill-del`; opacity .35 גם בלי hover — נגיש במגע).

### P-21 · משימות וסדר-יום
- **בבעלות:** `js/views/todos.js`, `js/views/eisenhower/` (מפתח `eisenhower`)
- **משימות פתוחות:**
  - [ ] איחוד מערכת המשימות (מפת הדרכים — todos מפוזרים בין יומן/משימות)
  - [ ] קנבן למשימות (backlog מאושר-מחקר)

### P-22 · מעקב בריאות והרגלים
- **בבעלות:** `js/views/habits.js`, `mood.js`, `water.js`
- **backlog:** שנה-בפיקסלים · מתאמי מצב-רוח · הישגים/רצפים

### P-23 · תקציב ומטרות
- **בבעלות:** `js/views/budget.js`, `goals.js`
- **backlog:** תקרות תקציב לקטגוריה · תנועות קבועות · דוח חודשי PDF

### P-24 · סקירה שבועית
- **בבעלות:** `js/views/weekly-review/` (מפתח `weeklyReviews`)
- **מהות:** 3 שדות רפלקציה עשירים + תמונות, ארכיון + חיפוש, העברת משימות +7 ימים.
- **זהירות:** dateKey הוא UTC — עיגון T12:00. כתיבה ל-tasks = רק כפעולת משתמש מפורשת.

---

## §4. תחום ידע ולכידה (KNOWLEDGE)

### P-30 · הערות
- **בבעלות:** `js/views/notes.js` (משתמש ב-`window.Editable` — לא לשכפל לוגיקת תמונות)

### P-31 · קשרים בין נושאים
- **בבעלות:** `js/features/backlinks/`, `js/views/graph/`, `js/components/topic-open.js` (`window.TopicOpen`)
- **מהות:** פאנל "מי מקשר לכאן" (MutationObserver, אזכורי מילה-שלמה עם גבולות עבריים ידניים), מפת-קשרים SVG.

### P-32 · מרכז הדגשות | P-33 · כרטיסיות זיכרון | P-34 · לוח שרטוט | P-35 · רשימת קריאה | P-37 · ביום הזה | P-38 · פרומטים
- **בבעלות (בהתאמה):** `js/views/highlights/` · `js/views/flashcards/` (מפתח `flashcards`) · `js/views/sketch/` · `js/views/readinglist/` (מפתח `readingList`) · `js/features/onthisday/` · `js/views/prompts/` (מפתח `prompts`, `css/features/prompts.css`)
- **CSS משותף ל-B7–B16:** `css/features/extras.css` — בלוק מבודד לכל אחריות; מותר לגעת רק בבלוק שלך.

### P-36 · סריקת מסמך (OCR)
- **בבעלות:** `js/views/tools/doc-scan/` (`window.Tools.docScan`)
- **זהירות:** נתיבי Tesseract מוחלטים בלבד (`location.origin+…`) — יחסיים נשברים ב-Worker.
- **backlog:** חיפוש OCR בתוך תמונות המחברת

### P-39 · תורות, חוקים ומשפטים
- **בבעלות:** `js/views/torot/` (`index.js` = מודול ה-view; `torot.html` = נכס המסמך), `css/features/torot.css`
- **מהות:** תצוגת-תוכן סטטית (id `torot`, קבוצת "ידע ולכידה"). הטקסט המקראי המלא של חמישה חומשי תורה ממוין
  ל-3 תורות ראשיות (חוקים/משפטים/תורות) → תתי-סעיפים → 76 כרטיסים, עם חיפוש (מתעלם ניקוד/טעמים/מקף),
  כיווץ/פתיחה ב-3 רמות, ותיבות מקבילה נפתחות מהספרים החיצוניים (יובלים/אריסטיאס/בן סירא, טקסט מ-Sefaria).
- **ארכיטקטורה (SoC):** המסמך הוא HTML **עצמאי** (CSS/JS משלו) שנטען ב-**iframe** → בידוד מלא, אין namespace
  גלובלי, אין נגיעה ב-state, אפס התנגשות עם האפליקציה.
- **מקור + בנייה-מחדש:** פרויקט עצמאי `C:\Users\ACER\Documents\claude AI\תורות-התורה-פרויקט`
  (README.md + `scripts/build_html3.py` + `scripts/torah/all.json` נתוני ספריא). לעדכון: בונים שם →
  מעתיקים `תורות_התורה.html` ל-`js/views/torot/torot.html` → מקפיצים `?v` (const SRC ב-index.js + index.html).
- **נקודות-מגע:** שורת SECTIONS ב-app.js · child בקבוצת knowledge ב-`js/features/navmode/index.js`
  (⚠️ navmode לא קורא רק את שדה `group` — חובה להוסיף גם ל-`GROUPS[].children` אחרת הפריט לא מופיע בסרגל) ·
  link+script ב-index.html.
- **סטטוס:** ✅ יציב (v=1). אין מפתח Store, אין סנכרון.

---

## §5. תחום כלים (TOOLS) — כל כלי עצמאי לחלוטין

### P-40 · מעטפת הכלים
- **בבעלות:** `js/views/stickers.js` — hero + אריחים + מודאל; בנייה עצלה. נקודת-מגע לכל כלי חדש.
- **עדכון (6.7.2026, `18a99e7`, stickers v=38):** 5 הקטגוריות הפכו ל**אקורדיון מתקפל**
  (מצב פר-קטגוריה ב-localStorage; הראשונה פתוחה) — פותר את עומס 21 האריחים בבת-אחת.

### P-41 · המרות Word↔PDF
- **בבעלות:** `js/views/tools/word-to-pdf/`, `tools/pdf-to-word/` (חילוץ PDF.js: טקסט+צבע+הדגשות+תמונות; זיהוי PDF-סרוק)

### P-42 · פעולות PDF מקומיות
- **בבעלות:** `js/views/tools/pdf-ops/` — shared/merge/split/delete/rotate/pdf-to-jpg/img-to-pdf/compress/flatten/unlock/ocr (pdf-lib+JSZip+Tesseract מאורזים, אפס העלאה)

> **עדכון P-42 (5.7.2026, `e68799c`):** נוספו `watermark.js` (סימן-מים, עברית דרך canvas→PNG),
> `reorder.js` (סדר-מחדש עם parseOrder משלו), `fill-form.js` (מילוי AcroForm; עברית = ציור על
> ה-widget). ראה ARCHITECTURE §19.

### P-43 · תרגום PDF
- **בבעלות:** `js/views/tools/pdf-translator/` (`PTR_ENGINE`), `tools/pdf-book-translator/` (`PBT_ENGINE` — תרגום על-גבי-התמונה, MyMemory, דגימת-רקע dominantBg, שומר-ניגודיות)
- **זהירות:** `appBase()` מ-location.href (תת-נתיב!); RTL על canvas בלי היפוך ידני.

### P-44 · תמלול וידאו
- **בבעלות:** `js/views/tools/video-transcriber/` — utils/audio/mp3/worker-api/ffmpeg/save/ui-toast/index
- **מהות:** ענן נתחי 90ש ×3 במקביל → Whisper מקומי כ-fallback. סדר טעינה ב-index.html קריטי.
- **בוצע (15.7.2026, `06f6eba`, media v=58 · image v=27 · editor v=56):** 📥 **ייבוא Word לפתק** — כפתור-סרגל שממיר docx (mammoth) ומזריק דרך צינור-ההדבקה (`EditableImage.insertHtmlWithImages`) — טקסט + כל התמונות כ-base64. זה הפתרון ל"העתקה מוורד מאבדת תמונות": ⚠️ **עובדה קבועה — וורד לא מוסר ביטי-תמונות ללוח בהעתקה מעורבת (רק file:///); אל תנסו "לתקן" את ה-paste שוב.** אומת עם קובץ אמיתי: 19/19 תמונות. בוצע (23.7, `b54bbcc`, media v=60 · editor v=57): ✅ **תמונות-כבדות→ענן** (convertHeavyImagesToCloud/hydrateCloudImages, מטמון hamachberet-imgcache; ⚠️ ה-placeholder חייב להישאר SVG — ה-GIF של שומר-הגודל מפעיל את מגן-המדיה וחוסם סנכרון!) + ייבוא ‎.doc לפי חתימת-בייטים (MHTML של הייצוא-שלנו נתמך, כולל src יחסי). עדכון 23.7 (`8d2b23b`): ההמרה מופעלת מ-saveImmediate — כל שמירה, כולל הדבקה; אזהרת שומר-הגודל יכולה להופיע פעם-חולפת-אחת בלבד.
- **בוצע (15.7.2026, `5ce950c`, media v=57 · editor v=55):** ☁️ **ריפוי-אוטומטי לקבצים מקומיים-בלבד** — בפתיחת-פתק, כרטיסי `data-content` (מסלול-הנפילה הישן; נחתכים מהענן ע"י שומר-הגודל ⇒ "לא רואה את הקובץ ממחשב אחר") מועלים אוטומטית ל-Firestore-chunks ומוחלפים ל-`data-fs`. אידמפוטנטי; מנעול+מטמון-סשן נגד כפל-העלאה (השמירה דחויה 500ms — rebuild באמצע קורא גוף ישן!). מדלג על כרטיסים ריקים ו->20MB. ⚠️ אל תסירו את המטמון — הוא מה שמונע העלאה-כפולה.
- **בוצע (15.7.2026, `0bde275`, worker-api v=29):** 🐞 **watchdog-timeout לכל העלאת-נתח** (`VT_WORKER.FETCH_TIMEOUT_MS`, ברירת-מחדל 3 דק') — תיקון "תמלול נתקע בהקלטה של 2+ שעות": בלי timeout, fetch שנתלה הקפיא lane לנצח (3 תלויים = הכול קפוא בלי שגיאה). ה-abort מכסה זרימה+buffered+קריאת-תשובה; timeout בזרימה לא נופל ל-buffered אלא ישר ל-retry. ⚠️ **כלל: אסור להוסיף למנוע בקשת-רשת בלי signal/timeout.** (הורחב 15.7, `0f0cab3`+`ec0dc42`: גם תרגום-gtx ‏25ש, MyMemory ‏20ש, ו-Firestore-backup ‏30ש תחומים — כל נקודות-הרשת בזרימה מכוסות.)
- **בוצע (15.7.2026, `fa52be7`, worker-api v=27 · index v=28 · mp3 v=27 · audio v=27):** ✅ **5 שיפורי-מנוע** (מסקירת ההשוואה קול↔וידאו): (1) 🐞 **התרגום חזר לעבוד** — ‎/translate של ה-Worker מת (Llama-3 הוצא משימוש 30.5, HTTP 500 קבוע); הוחלף ב-`VT_WORKER._translateText` — Google gtx (sl=auto) + fallback MyMemory, אותו מנוע שהוכח בקול. (2) ⚡ **תמלול מקבילי** — `_runChunkLanes`/`_transcribeViaWorkerParallel` (3 lanes, ‏3 ניסיונות/נתח, המשך-חלקי; נתח מת לא מפיל ריצה — מדווח "N/M קטעים לא תומללו") החליף את הלולאות הטוריות בנתיב ה-PCM **וגם** בנתיב ה-MP3. (3) 🧠 **decode רזה** — mono מחזיר view על ה-AudioBuffer (‎~1.5GB→~690MB ל-3ש); מגן-העתקה לפני transfer ל-Whisper המקומי. (4) 💾 `useBrowserCache:true` — מודל ה-fallback (~150MB) יורד פעם אחת, לא כל סשן. (5) 🔗 **מקור-אמת יחיד** — `VT_WORKER.WORKER_URL` + `LOCAL_WHISPER_SRC` (היו משוכפלים מול הקול). ⚠️ אל תחזירו לולאה טורית בלי retry ואל תחזירו את endpoint ה-Worker לתרגום — שניהם הבאגים שתוקנו.

### P-45 · מעבדת דשבורדים (file-dashboard)
- **בבעלות:** `js/views/tools/file-dashboard/{extract,analyze,render,guide,export,index}.js`,
  `css/features/filedash.css`, vendor: `js/vendor/xlsx.full.min.js` (SheetJS 0.20.3).
- **מהות:** view `filedash` (מתחת ל"תובנות") — קובץ (Excel/CSV/PDF/Word/JSON/TXT) → זוויות
  אמיתיות מהנתונים → דשבורד חי (KPI/גרפים/תובנות-מחוקים) → ייצוא HTML עצמאי (גרפים כ-PNG).
  מדריך "הוראות הפעלה" מובנה. ראה ARCHITECTURE §17.
- **בוצע (5.7.2026, קומיטים `55bb19e`+`1107888`):** הפיצ'ר כולו, מאומת חי עם CSV אמיתי
  (מספרים נבדקו ידנית: סכום/ממוצע/נתח-מוביל/מגמה).
- **זהירות:** אפס מפתחות Store; Chart.js נטען עצל עם בדיקת window.Chart (חולק vendor עם
  "תובנות"); מודאל המדריך ממחזר כיתות ds-guide-* של docstudio.

### P-47 · ארגז PM (pm-toolkit)
- **בבעלות:** `js/views/tools/pm-toolkit/{data,index}.js`, בלוק pmkit ב-`css/features/pmkit.css`
- **מהות:** view `pmkit` — 8 מחוללי פרומפטים לניהול מוצר (טופס→פרומפט חי+צ'קליסט),
  7 מסגרות, 4 תבניות. שמירה ל-Store('prompts') בסכימת עמוד הפרומטים. ראה ARCHITECTURE §18.
- **בוצע (5.7.2026, קומיט `1095fb3`):** הפיצ'ר כולו, מאומת חי.
- **זהירות:** data.js = המקור מ-`PM-Toolkit/` (מחוץ לריפו) עטוף IIFE — שינויי תוכן לערוך
  כאן, לא במקור; תלות בכיתות ds-* של docstudio.css ובסכימת prompts של P-38.

### P-49 · עריכת Word (docx-edit)
- **בבעלות:** `js/views/tools/docx-edit/index.js` (→ `Tools.docxEdit`)
- **מהות:** docx=zip+XML: החלפה גלובלית (שימור עיצוב), קבלת שינויים-במעקב, חילוץ טקסט.
- **בוצע (5.7.2026, `b73a665`).** תלות רכה: window.PdfOps (עזרי UI). ראה ARCHITECTURE §19.

### P-50 · יוצר אקסל (xlsx-maker)
- **בבעלות:** `js/views/tools/xlsx-maker/index.js` (→ `Tools.xlsxMaker`)
- **מהות:** xlsx עם נוסחאות חיות (SheetJS): 3 תבניות פיננסיות + טבלה חופשית עם SUM.
- **בוצע (5.7.2026, `94496a3`).** חולק vendor עם P-45 (בדיקת window.XLSX). ראה ARCHITECTURE §19.

### P-51 · נווט שוק העבודה (job-nav)
- **בבעלות:** `js/views/tools/job-nav/{data,cv,index}.js`, `css/features/jobnav.css`
- **מהות:** view `jobnav` (ליד "סטודיו מסמכים") — פורט מלא של job-market-navat-haavoda:
  4 מסלולים (קו"ח ישראלי עם כלל-הברזל [---למלא---] + ייצוא PDF/Word + מכתב מקדים / תוכנית
  חיפוש / הכנה לראיון / שכר-ומו"מ). ראה ARCHITECTURE §20.
- **בוצע (5.7.2026, קומיט `1501ca5`):** הפיצ'ר כולו, מאומת חי.
- **זהירות:** אפס מפתחות Store (טיוטה ב-localStorage); כלל-הברזל ב-cv.js `ph()` — לא להסיר;
  נתוני שכר = טווחים, לא להמציא תפקיד חסר; תלות בכיתות ds-* ובסכימת prompts של P-38.

### P-48 · סטודיו חיפוש ארגוני (search-studio)
- **בבעלות:** `js/views/tools/search-studio/{data,index}.js`, בלוק ess ב-`css/features/pmkit.css`
- **מהות:** view `searchstudio` — בונה פקודות /search+/digest (כל המסננים), הדגמת
  תשובה-מסונתזת/ייחוס/ביטחון + digest על נתוני-דמה, מדריך 5 הסקילים. ראה ARCHITECTURE §18.
- **בוצע (5.7.2026, קומיט `1095fb3`):** הפיצ'ר כולו, מאומת חי.
- **זהירות:** data.js = העתק verbatim מ-`Enterprise-Search-Studio/` (namespace window.ES);
  אותן תלויות כמו P-47.

### P-46 · סטודיו מסמכים (hebrew-doc-studio)
- **בבעלות:** `js/views/tools/doc-studio/{templates,guide,export,index}.js`, `css/features/docstudio.css`
- **מהות:** view `docstudio` — 8 תבניות מסמכים עסקיים ישראליים, טופס+תצוגת A4 חיה,
  ייצוא PDF (HtmlToPdf המשותף) / Word (mso) / HTML, מדריך "הוראות הפעלה" מובנה,
  טיוטות ב-IndexedDB עצמאי. ראה ARCHITECTURE §16.
- **בוצע (5.7.2026, קומיט `032ffbb`):** הפיצ'ר כולו, מאומת חי.
- **זהירות:** אפס מפתחות Store; עיצוב המסמך רק ב-baseCss שב-templates.js; סף מספר-ההקצאה
  (`ALLOCATION_THRESHOLD=5000`) — לעדכן אם רשות המסים תשנה.

---

## §6. תחום קול (VOICE)

### P-50 · הכתבה קולית
- **בבעלות:** `js/features/voice/dictation.js` (`window.VoiceDictation`) — הזרקת 🎤 ב-MutationObserver, Web Speech he-IL.

### P-51 · הקלטות ותמלול
- **בבעלות:** `js/features/voice/memos.js` (`window.VoiceMemos`), `transcribe.js`, `backup.js` (`window.VoiceBackup`) — IndexedDB נפרד `hamachberet-voice`. גם `css/features/voice.css`.
- **בוצע (14.7.2026):** רובריקה שנייה "🇬🇧 הערות קול באנגלית" — הקלטה+תמלול באנגלית, תרגום אוטומטי לעברית, ייצוא Word בעברית (+מקור אנגלי בהמשך) וכפתור 🇬🇧 למקור-בלבד. שדה `lang` על כל הקלטה; רשומות ישנות = עברית. ראה ARCHITECTURE (פסקת "קול").
- **בוצע (15.7.2026, transcribe v=8):** 🐞 **תיקון תרגום שנכשל.** מנוע התרגום הראשי היה endpoint ‎/translate של ה-Worker (Llama-3) — Cloudflare הוציאה את המודל משימוש (2026-05-30, `5028 model deprecated`, HTTP 500), וה-fallback MyMemory נגמר מכסתו היומית (429) → "התרגום נכשל". הוחלף ב-**Google Translate** (gtx חינמי, `_googleTranslateHe`) כמקור ראשי; MyMemory נשאר fallback. אומת חי עם הטקסט האנגלי המדויק של המשתמש → עברית שוטפת ~1.1ש.
- **בוצע (15.7.2026, transcribe v=9):** 🛡️ **עמידות להקלטות ארוכות (3 שעות ≈ 120 נתחים).** `cloudChunkedParallel` קיבל **ניסיון-חוזר per-נתח** (3 ניסיונות, backoff 2.5/5ש) + **המשך-חלקי** — נתח שנכשל סופית מדולג (119/120 במקום כלום), רק כשל-כולל זורק→מקומי. הנתחים החסרים מדווחים (progress + תווית מנוע).
- **בוצע (15.7.2026, transcribe v=10):** 🧠 **פענוח חסכוני-בזיכרון.** `VT_AUDIO._decodeAnyFileToPcm` (בעלות P-44!) מעתיק את כל ה-PCM → שיא ~1.5GB ל-3ש (עלול להיכשל בטלפון). **בלי לגעת בקובץ של P-44** — נוספה `_decodeLean` בקול שמחזירה **view** אל ה-AudioBuffer (בלי העתקה) → שיא ~690MB; נכשל container → נפילה אוטומטית ל-VT_AUDIO (אפס רגרסיה). אומת: פענוח מלא לא-קטום + נפילה מאומתת. (ירידה מ-690MB תדרוש WebCodecs — לא נדרש.)
- **בוצע (14.7.2026):** כפתור "🔊 הקלט שמע מהטאב" בשני הכרטיסים — לכידת שמע דיגיטלי של סרטון/שיעור מטאב אחר (`getDisplayMedia`, audio-only) לתמלול איכותי בלי מיקרופון. גוף ההקלטה שותף ל-`beginRecording(stream, extraStream)`. מדריך הפעלה (מה עושה + 5 שלבים) מ-`guideBody()` המשותף, מוצג בחלון קופץ ב-hover על הכפתור (`.vm-tab-pop`/`vm-pop-open`) + `<details>` מתקפל כגיבוי למגע.
- **זהירות (commit 65107d3):** הקלטה רציפה חיה ברמת המודול; `hashchange` עוצר ניגון בלבד — **אסור להחזיר לשם stopRec()**. שלט צף `.vm-rec-pill` בכל עמוד. מאז יולי 2026 המצב החי הוא `_cards`+`_recLang` (לא `_ui`); הקלטה אחת פעילה בכל רגע בשתי הרובריקות.

---

## §7. תחום עוזר וחיפוש (ASSIST)

### P-60 · העוזר החכם
- **בבעלות:** `js/views/assistant/` — knowledge.js / engine.js / ui.js + `css/features/assistant.css`
- **חוזה תחזוקה:** כל פיצ'ר חדש באתר מוסיף רשומת HELP + מעדכן overview.

### P-61 · חיפוש מהיר (Ctrl+K)
- **בבעלות:** `js/features/palette/` (`window.Palette`)
- **משימות פתוחות:** [ ] חיפוש גלובלי אמיתי בכל התוכן (מפת הדרכים)

---

## §8. תחום מסחר (WYCKOFF) — ⚠️ שני כלים נפרדים, לא לבלבל

### P-70 · ניתוח וויקוף עצמאי (חדש)
- **בבעלות:** `js/views/wyckoff/` — data/engine/chart/index + `css/features/wyckoff.css`
- **מקור-אמת:** `js/views/wyckoff/CONTRACT.md` — לקרוא לפני כל שינוי. Binance חי, מנוע-חוקים בדפדפן, דוח 3 מטבעות.
- **זהירות:** אסור לכתוב לתיקיית `wyckoff/` בשורש (נתוני הכלי הישן).

### P-71 · כרטיס וויקוף ישן (Worker)
- **בבעלות:** `js/views/dashboard/wyckoff/` — config/api/progress-modal/symbol-picker/card + תיקיית `wyckoff/` (נתונים)
- **מהות:** Cloudflare Worker + TradingView מקומי.

---

## §9. תחום טיולים (TRIPMAP)

### P-80 · מפה, ניווט ומסלולים
- **בבעלות:** `js/views/tripmap/` — config/engine/street/controls/routing/trip-layer/index + `css/features/tripmap.css`
- **מקור-אמת:** `js/views/tripmap/CONTRACT.md` — ממשקים ובעלות קבצים. מפתח Store: `trips`.

### P-81 · מתכנן הטיולים העצמאי
- **בבעלות:** `js/views/tripmap/planner-data.js` / `planner-engine.js` / `planner-ui.js` + `css/features/tripplanner.css`
- **מהות:** אשף 4 מסלולים, מאגר 122 אטרקציות מאומתות, מסמך-תוכנית מלא + ייצוא HTML עצמאי.

---

## §10. תחום דשבורד, תובנות והגדרות (HOME)

### P-90 · לוח הבקרה
- **בבעלות:** `js/views/dashboard/index.js` — מארח גנרי של `window.DASHBOARD_WIDGETS` (מיון לפי `fn.order`). לא יודע דבר על הפיצ'רים.

### P-91 · לוח תובנות
- **בבעלות:** `js/views/insights/` — index/charts (Chart.js מקומי, טעינה עצלה)
- **זהירות:** אין unmount-hook — הריסת גרפים בכל רינדור; subscribe בודק `document.contains`.

### P-92 · הגדרות
- **בבעלות:** `js/views/settings/` — חושף `window.SETTINGS_CARDS` (נקודת-הרחבה לכל מודול).

---

## §11. Backlog — רעיונות מאושרי-מחקר (טרם נבנו)

| רעיון | ישויך לפרויקט |
|---|---|
| תזכורות | P-21 |
| לכידה מהירה Ctrl+Shift+N | P-61 או feature חדש |
| נעילת PIN | P-01/P-05 |
| לוח עברי וחגים | P-20 |
| חבר וירטואלי (Finch) | פרויקט חדש |
| שנה-בפיקסלים · מתאמי מצב-רוח · הישגים/רצפים | P-22 |
| תקרות תקציב · תנועות קבועות · דוח חודשי PDF | P-23 |
| קנבן | P-21 |
| חיפוש OCR בתמונות | P-36 |

---

## §12. איך פותחים מיני-פרויקט חדש (תבנית)

1. תיקייה: `js/features/<שם>/` (בלי מסך) / `js/views/<שם>/` (עם מסך) / `js/views/tools/<שם>/` (כלי).
2. IIFE עם namespace אחד על `window`.
3. מסך → `App.register` + שורת SECTIONS. כלי → אריח ב-stickers.js.
4. נתונים → store-schema **וגם** אסרציה ב-firebase-sync (יחד!). בינארי גדול → IndexedDB נפרד.
5. CSS → בלוק ב-extras.css או קובץ ב-css/features + link.
6. רשומת HELP בבוט + עדכון overview.
7. תיעוד: סעיף ב-ARCHITECTURE.md + כרטיס P-xx כאן + רשומה ב-UPDATES.md.
8. אימות חי → קומיט אחד → דחיפה → אימות באתר החי.
- **בוצע (15.7.2026, `271e4de`, image.js v=26):** 🐞 **"מדביק רק חלק / בלי תמונות" בהדבקת סימון-הכול.** שני שורשים: (1) פריט-bitmap בקליפבורד (וורד שם גם HTML וגם bitmap) השתלט על ההדבקה — תמונה אחת נכנסה וכל הטקסט ושאר התמונות נזרקו; עכשיו HTML-עשיר (יש טקסט או יותר מתמונה אחת) גובר, וענף התמונה-הגולמית מטפל רק בצילום-מסך/העתק-תמונה. (2) תמונות `file:///` של וורד שהדפדפן לא רשאי לקרוא נמחקו בשקט; עכשיו הן הופכות ל-placeholder מקווקו גלוי (`nb-img-missing`, נמחק ב-✕ הרגיל) עם הסבר איך להביא את התמונה + toast עם הספירה. ⚠️ **אסור להחזיר את קדימות-הפריט-הגולמי או מחיקה-שקטה** — זה בדיוק הבאג. אומת ב-7 תרחישי קליפבורד סינתטיים.
- **בוצע (15.7.2026, `f19a4d2`+`41130a9`, memos v=13 · transcribe v=12 · voice.css v=9):** ☁️ **שחזור-מהענן** (מודאל: חסר→רשומת-טקסט-בלי-blob; קיים-בלי-תמלול→מיזוג-שומר-אודיו; קיים-עם-תמלול→לא-דורסים) + 🐞 **חיווי-פענוח להקלטות ארוכות** (>25MB: הודעה+שעון-חי — פענוח של דקות נראה היה "נתקע") + הודעת-אמת על נפילה-למקומי בהקלטה ארוכה. ⚠️ שורות בלי blob (משוחזרות) — נגן/הורדה/📝 מוסתרים בכוונה; אל תניחו ש-memo.blob קיים.
- **בוצע (15.7.2026, backup.js v=1 · memos v=12):** ☁️ **גיבוי-תמלולים ידני לענן.** כפתור ☁️ פר-הקלטה-מתומללת מגבה את **הטקסט בלבד** (תמלול+תרגום+חותמות; לא אודיו) למסמך `users/{uid}/voice-transcripts/{id}`. ⚠️ **החלטת משתמש: שום גיבוי אוטומטי — רק בלחיצה.** מחוץ ל-Store/סכימה בכוונה (כמו attachments). תמלול-מחדש מאפס את סטטוס-הגיבוי. שומר-גודל 900KB (חותך חותמות, לא טקסט). list()/fetchOne() מוכנים למסך-שחזור עתידי (טרם אושר).
- **בוצע (15.7.2026, `04b076e`, transcribe v=11 · memos v=11):** 🔗 **מעבר למנוע המשותף (אפס שינוי התנהגות).** מנוע-הנתחים-המקבילי, כתובת ה-Worker וקוד ה-Whisper-המקומי — שנכתבו כאן ושוכפלו בכלי-הווידאו — אוחדו ל-`VT_WORKER` (קומיט P-44 `fa52be7`); הקול צורך אותם (האצלה דקה ששומרת רק את תווית-המנוע). בונוס: המודל המקומי נהנה מ-`useBrowserCache:true`. תוקנו tooltips מיושנים ב-memos ("Llama-3"→"Google Translate"). אומת מקצה-לקצה עם ענן מדומה כולל נפילת-בסיסים ‎/vt-proxy→Worker.
