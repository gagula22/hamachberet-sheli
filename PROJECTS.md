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

**כללי ברזל (מ-RESPONSIBILITIES.md):**
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

### P-11 · עורך הטקסט
- **בבעלות:** `js/views/notebook/editor.js` (`window.nbEditor`)
- **מהות:** contenteditable, toolbar, undo/redo, טבלאות, שמירה-לענן (Ctrl+S).
- **משימות פתוחות:**
  - [ ] שינוי גופן גורף: סימון כל הטקסט + בחירת גודל עובד רק על פסקה בודדת
  - [ ] תמיכת מגע משופרת במחברת (מפת הדרכים)
- **זהירות (ARCHITECTURE §14 — חובה לקרוא):** מלכודת הבחירה. לחצני toolbar חייבים `preventDefault` על mousedown (כולל פופאפים שנפתחים ב-body!); לעולם לא לשחזר savedRange בעיוורון.

### P-12 · מדיה ותמונות
- **בבעלות:** `js/views/notebook/media.js` (`window.nbMedia`), `js/components/editable/` — `utils.js` (compressImage), `image.js`, `index.js` (`window.Editable*`), `js/features/cloud-files/` (`window.CloudFiles`)
- **מהות:** המשפך היחיד לכל תמונה באתר (מחברת/הערות/סקירה): הדבקה, figures, גרירה, ידיות-גודל, snap, מדיניות איכות. **קבצים מצורפים** (לא-תמונה): עולים ל-Firebase Storage (הנושא שומר קישור בלבד → מסתנכרן מלא, זמין מכל מכשיר), עם נפילה ל-base64 מקומי אם לא-מחובר.
- **בוצע (6.7.2026, `82c393c`, media v=49 + cloud-files v=1):** קובץ מצורף לענן (Storage) + תיקון פתיחה: Blob URL במקום data-URI-ב-iframe (שנכשל על קבצים גדולים = "טאב ריק").
- **בוצע (6.7.2026, `951ef0e`→`f70b19e`, media v=51 · editor v=53 · notebook.css v=51):** **כפתור הורדה ⬇ גלוי** בכל כרטיס קובץ → הורדה לתיקיית ההורדות (מקומי: Blob URL + `<a download>`; ענן: `<a download target=_blank>`). **לחיצה כפולה = פתיחה**. **כל האינטראקציות (⬇/×/dblclick) מואצלות על אלמנט העורך ב-editor.js — לא פר-כרטיס** → שורד רענון. ⚠️ **מלכודת שתוקנה:** חיווט פר-כרטיס עם `data-wired` דולף ל-body הנשמר וחוסם re-wire אחרי רענון (כפתורים מתים) — לכן **אסור לחזור לחיווט פר-כרטיס לכרטיסים שמסתנכרנים; להשתמש בהאצלה**. ⚠️ נתיב התמונות לא נגע.
- **בוצע (6.7.2026, `2f50aa7`, cloud-files v=2 · media v=52 · notebook.css v=52):** **אחוזי-התקדמות חיים בהעלאה** — `upload(file,id,onProgress)` מאזין ל-`UploadTask.state_changed` (bytesTransferred/totalBytes) וה-placeholder מציג "מעלה 45%…" עד ההחלפה בכרטיס-URL; `.file-uploading` מסגרת+אייקון פועם. ⚠️ **זמן ההעברה כבול-רוחב-פס** (גודל÷upstream) ולא ניתן להאצה בקוד — רק ההתקדמות נעשית גלויה. ההעלאה לא-חוסמת.
- **⚠️ תלות חיצונית:** דורש כללי-הרשאה ב-Firebase Storage שמתירים כתיבה ל-`users/{uid}/attachments/` למשתמש מחובר; אם ההעלאה נכשלת → נפילה מקומית + toast. **אסור לגעת בנתיב שמירת התמונות** (media.js insertImage/Editable) — הוא לא קשור לקבצים.

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
- **בבעלות:** `js/features/voice/memos.js` (`window.VoiceMemos`), `transcribe.js` — IndexedDB נפרד `hamachberet-voice`.
- **זהירות (commit 65107d3):** הקלטה רציפה חיה ברמת המודול; `hashchange` עוצר ניגון בלבד — **אסור להחזיר לשם stopRec()**. שלט צף `.vm-rec-pill` בכל עמוד.

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

## §12. איך פותחים מיני-פרויקט חדש (תבנית מ-RESPONSIBILITIES.md חלק ד')

1. תיקייה: `js/features/<שם>/` (בלי מסך) / `js/views/<שם>/` (עם מסך) / `js/views/tools/<שם>/` (כלי).
2. IIFE עם namespace אחד על `window`.
3. מסך → `App.register` + שורת SECTIONS. כלי → אריח ב-stickers.js.
4. נתונים → store-schema **וגם** אסרציה ב-firebase-sync (יחד!). בינארי גדול → IndexedDB נפרד.
5. CSS → בלוק ב-extras.css או קובץ ב-css/features + link.
6. רשומת HELP בבוט + עדכון overview.
7. תיעוד: סעיף ב-ARCHITECTURE.md + כרטיס P-xx כאן + רשומה ב-UPDATES.md.
8. אימות חי → קומיט אחד → דחיפה → אימות באתר החי.
