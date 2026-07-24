# ARCHITECTURE — מפת אחריות (Separation of Concerns)

> **העיקרון:** כל חלק = אחריות אחת ויחידה. כדי לשנות נושא מסוים — נוגעים **רק** בקובץ
> שאחראי עליו. אסור לערבב אחריות. שינוי בנושא אחד לא אמור לגעת בקוד של נושא אחר.
>
> **כלל עבודה:** לפני כל שינוי — מאתרים במפה למטה מי האחריות, ועובדים רק שם.

עודכן: יולי 2026 · ענף עבודה: `main` (הרפקטור מוזג והוטמע)

> 📌 **מסמכים נלווים (5.7.2026):** `PROJECTS.md` — מפת מיני-פרויקטים (P-01…P-92) לעבודה עם
> Claude Code/Cowork, כולל כללי מניעת-התנגשות · `UPDATES.md` — יומן עדכונים + פרוטוקול handoff
> מחייב (כל סוכן קורא אותו ראשון ומעדכן אותו בכל עצירה).

---

## 1. מבנה הקבצים לפי אחריות

```
מחברת/
├── index.html                       טוען את כל המודולים לפי סדר תלות
│
├── css/
│   ├── tokens.css                   משתני CSS (צבעים, פונטים, spacing)
│   ├── layout.css                   sidebar, topbar, grid ראשי
│   ├── components.css               בסיס משותף (card/btn/grid/chip/stat) + features קטנים + responsive
│   └── features/
│       └── notebook.css             ⭐ כל העיצוב של המחברת בלבד (ribbon, עורך, נושאים, תגיות)
│
├── js/
│   ├── app.js                       bootstrap + hash-router + רשימת SECTIONS
│   ├── store.js                     אחסון (IndexedDB/localStorage) + state + ייצוא/ייבוא JSON
│   ├── firebase-config.js           הגדרות Firebase
│   ├── store-schema.js              ⭐ מקור-אמת יחיד למודל הנתונים (default+sync+merge לכל key)
│   ├── firebase-sync.js             לוגיקת סנכרון + זרימת התחברות (login modal נשאר עם ה-auth)
│   ├── firebase-ui.js               ⭐ UI של הסנכרון: באנר, שבב סטטוס, כפתור סנכרון, סרגל משתמש
│   │
│   ├── components/
│   │   ├── sidebar.js               ניווט בלבד (רישום הסקשנים + active state)
│   │   ├── data-transfer.js         ⭐ בר גיבוי: ייצוא/ייבוא/הדבקת JSON → window.DataBackup
│   │   ├── html-to-pdf.js           ⭐ מנוע משותף: HTML → קובץ PDF אמיתי (רינדור html2canvas + עימוד לפי בלוקים) → window.HtmlToPdf
│   │   └── editable/                רכיב עריכה משותף (מחברת + הערות)
│   │       ├── utils.js             debounce, compressImage            → window.EditableUtils
│   │       ├── image.js             ⭐ תמונות/צילומי-מסך: הדבקה, הוספה, figures, גרירה, snap
│   │       │                                                            → window.EditableImage
│   │       └── index.js             מרכיב את הממשק הציבורי              → window.Editable
│   │
│   └── views/                       כל view = נושא אחד, נרשם דרך App.register(id, render)
│       ├── dashboard/
│       │   ├── index.js             לוח הבקרה. מארח גנרי — מרנדר widgets מ-window.DASHBOARD_WIDGETS.
│       │   │                        אינו יודע דבר על Wyckoff.
│       │   └── wyckoff/             "הפקת ניתוח/דוח" — מנותק לחלוטין מהמחברת
│       │       ├── config.js        קבועים: WORKER_URL, fallbacks, intervals  → window.WyckoffConfig
│       │       ├── api.js           תקשורת Worker (trigger/progress/watchlist), בלי DOM → window.WyckoffAPI
│       │       ├── progress-modal.js  UI של מודאל ההתקדמות
│       │       ├── symbol-picker.js   UI של בורר המטבעות               → window.Wyckoff
│       │       └── card.js          הכרטיס בדשבורד — רושם את עצמו ל-DASHBOARD_WIDGETS
│       │
│       ├── notebook/
│       │   ├── index.js             עץ הנושאים + layout/sidebar. חושף window.nbTree / nbCore / nbActive
│       │   ├── editor.js            ⭐ העורך: contenteditable, undo/redo, toolbar, טבלאות → window.nbEditor
│       │   ├── media.js             ⭐ תמונות/קבצים/טבלאות/בלוקי mood   → window.nbMedia
│       │   └── export.js            ⭐ הפקת מסמך: תבניות, mood, ייצוא Word/PDF → window.nbExport
│       │
│       ├── tools/                   view "כלים" — כל כלי עצמאי לחלוטין
│       │   ├── word-to-pdf/index.js          → window.Tools.wordToPdf (משתף components/html-to-pdf.js)
│       │   ├── pdf-to-word/index.js           → window.Tools.pdfToWord (טקסט נערך+שחזור Win-1255 / מראה-מדויק; ראה §6)
│       │   ├── pdf-ops/              ⭐ פעולות PDF מקומיות (pdf-lib מאורז ב-js/vendor) — אפס העלאה
│       │   │   ├── shared.js         ensureLib/ensureZip/download/dropzone/parseRanges → window.PdfOps (pdf-lib+JSZip מאורזים)
│       │   │   ├── merge.js  split.js  delete.js  rotate.js → window.Tools.pdf{Merge,Split,Delete,Rotate}
│       │   │   ├── pdf-to-jpg.js      רינדור עמודים→JPG (zip ל-רב-עמודי) → window.Tools.pdfToJpg
│       │   │   ├── img-to-pdf.js      JPG/PNG→PDF (pdf-lib)               → window.Tools.imgToPdf
│       │   │   ├── compress.js        דחיסה ע"י רסטור עמודים→JPG          → window.Tools.pdfCompress
│       │   │   ├── flatten.js         שיטוח טפסים (pdf-lib form.flatten)  → window.Tools.pdfFlatten
│       │   │   ├── unlock.js          הסרת הגבלות בעלים (re-save)         → window.Tools.pdfUnlock
│       │   │   └── ocr.js             PDF סרוק→Word נערך, OCR עברי מקומי (Tesseract.js מאורז ב-js/vendor/tesseract) → window.Tools.pdfOcr
│       │   ├── pdf-translator/
│       │   │   ├── translate.js     מנוע התרגום הטהור   → window.PTR_ENGINE
│       │   │   └── index.js         UI + תזמור           → window.Tools.pdfTranslator
│       │   └── video-transcriber/   → window.Tools.videoTranscriber
│       │       ├── utils.js         פונקציות טהורות      → window.VT_UTILS
│       │       ├── audio.js         פענוח PCM/WAV        → window.VT_AUDIO
│       │       ├── mp3.js           ניתוח/חיתוך MP3      → window.VT_MP3
│       │       ├── worker-api.js    תקשורת Cloudflare    → window.VT_WORKER
│       │       ├── ffmpeg.js        חיתוך/חיבור וידאו    → window.VT_FFMPEG
│       │       ├── save.js          שמירת קבצים          → window.VT_SAVE
│       │       ├── ui-toast.js      התראות צפות          → window.VT_TOAST
│       │       └── index.js         main UI + whisper (מחזיק whisper state)
│       │
│       ├── assistant/              ⭐ העוזר החכם — אחריות עצמאית, 100% מקומי (אפס רשת/כתיבה)
│       │   ├── knowledge.js         ידע-עזרה סטטי על כל פיצ'ר/כפתור        → window.AsstKnowledge
│       │   ├── engine.js            טוקנייזר עברי + אינדוקס Store + חיפוש מדורג + תשובות מחושבות → window.AsstEngine
│       │   └── ui.js                כפתור צף + פאנל צ'אט + view 'assistant'  → window.Assistant
│       ├── stickers.js              מעטפת "כלים": hero + 5 קטגוריות כ**אקורדיון מתקפל** (מצב פתוח/סגור פר-קטגוריה ב-localStorage `mahberet.toolcat.<i>`, הראשונה פתוחה כברירת-מחדל); כל אריח פותח את הכלי ב-MODAL מוקפץ (✕/ESC/רקע). קורא ל-window.Tools.*
│       ├── calendar.js              ניתוב יומן → daily/weekly/monthly
│       ├── daily.js weekly.js monthly.js   תצוגות יומן
│       └── notes.js todos.js habits.js mood.js water.js budget.js goals.js
│
└── wyckoff/                         נתוני דוחות (גרפים, דוחות HTML, watchlist.json) — לא קוד אפליקציה
```

⭐ = אחריות שחולצה לקובץ ייעודי במהלך הרפקטור.

---

## 2. "איפה משנים מה" — מדריך מהיר

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| כתובת ה-Worker של Wyckoff / רשימת מטבעות ברירת-מחדל | `dashboard/wyckoff/config.js` |
| איך מדברים עם ה-Worker (endpoints, fetch) | `dashboard/wyckoff/api.js` |
| מראה מודאל ההתקדמות של הניתוח | `dashboard/wyckoff/progress-modal.js` |
| מסך בחירת המטבע | `dashboard/wyckoff/symbol-picker.js` |
| הכרטיס של Wyckoff בדשבורד | `dashboard/wyckoff/card.js` |
| הלוח-בקרה עצמו (סטטיסטיקות, גריד) | `dashboard/index.js` |
| הדבקת/הוספת **צילום מסך** או תמונה (כללי) | `components/editable/image.js` |
| תמונות/קבצים/טבלאות במחברת | `notebook/media.js` |
| ייצוא מחברת ל-Word/PDF, תבניות, mood | `notebook/export.js` |
| עריכת טקסט במחברת (עורך, toolbar, undo, טבלאות) | `notebook/editor.js` ⚠️ ראה §14 (מלכודת בחירה) |
| עץ הנושאים / סרגל צד של המחברת | `notebook/index.js` |
| תצוגות יומן (יומי/שבועי/חודשי) | `views/daily.js` / `weekly.js` / `monthly.js` — בשבועי: 📅 על משימה מעביר לכל תאריך (בורר נייטיבי; value = `Store.dateKey`) |
| סטודיו מסמכים (תבניות/מדריך/ייצוא/UI) | `views/tools/doc-studio/<האחריות>.js` — ראה §16 |
| מעבדת דשבורדים (חילוץ/ניתוח/רינדור/ייצוא) | `views/tools/file-dashboard/<האחריות>.js` — ראה §17 |
| ארגז PM / סטודיו חיפוש (מחוללי פרומפטים) | `views/tools/pm-toolkit/` · `views/tools/search-studio/` — ראה §18 |
| כלי תמלול — לוגיקת אודיו / mp3 / whisper / ffmpeg | `tools/video-transcriber/<האחריות>.js` |
| כלי המרת PDF↔Word / תרגום PDF | `tools/<הכלי>/index.js` |
| יצירת קובץ PDF מ-HTML (מחברת + Word→PDF) | `components/html-to-pdf.js` (`window.HtmlToPdf`) |
| עיצוב המחברת | `css/features/notebook.css` |
| עיצוב משותף (כפתורים, כרטיסים) | `css/components.css` |
| מודל הנתונים — default/סיווג-סנכרון לכל key | `store-schema.js` |
| אחסון מקומי / לוגיקת מיזוג בענן | `store.js` · `firebase-sync.js` |
| UI של הסנכרון (באנר, סטטוס, כפתור, סרגל משתמש) | `firebase-ui.js` |
| העוזר החכם — ידע/הסברי-עזרה | `js/views/assistant/knowledge.js` |
| העוזר החכם — חיפוש/דירוג/תשובות מחושבות | `js/views/assistant/engine.js` |
| העוזר החכם — כפתור צף / פאנל / view / עיצוב | `js/views/assistant/ui.js` · `css/features/assistant.css` |

---

## 3. מוסכמות חיווט (Wiring)

- **רישום view:** כל view קורא `App.register('id', renderFn)` פעם אחת.
- **תקשורת בין מודולים:** דרך אובייקט namespace על `window` (למשל `window.nbMedia`).
  קובץ צרכן "מייבא" בשורה אחת בראש ה-IIFE: `var x = window.NS.x;` (rebind) — כך **אפס שינוי ב-call-sites**.
- **State משתנה (mutable):** נשאר תמיד בקובץ אחד עם כל הקוראים/כותבים שלו. לא מועבר by-value בין קבצים.
- **סדר טעינה ב-index.html:** קודם תלויות, אחר כך הצרכנים (utils → audio/save → worker → mp3 → ui → index).
- **Widgets בדשבורד:** פיצ'ר שרוצה כרטיס בדשבורד דוחף פונקציית-render ל-`window.DASHBOARD_WIDGETS`.
  הדשבורד מרנדר את כולן — בלי לדעת מה הן.

---

## 4. טרם הופרד (TODO — לפי סדר עדיפות/סיכון)

| נושא | סטטוס | סיכון |
|---|---|---|
| ליבת ה-notebook | ✅ editor.js חולץ. tree+layout נשארו ב-index.js (מלוכדים, 510 ש' — תקין) | — |
| firebase auth-UI | ✅ UI חולץ ל-`firebase-ui.js` (באנר/סטטוס/כפתור/סרגל). login modal נשאר עם ה-auth (מכוון) | — |
| איחוד `insertImage` | ✅ נותב למימוש הקנוני (editable/image.js). מימושי media.js הישנים = dead code | — |
| `store-schema` | ✅ `store-schema.js` = מקור-אמת; defaults + key-lists נגזרים ממנו + assertion קשיח | — |
| `sidebar.js` → הפרדת ייצוא/ייבוא | ✅ בר הגיבוי חולץ ל-`data-transfer.js` (window.DataBackup) | — |
| גרסת cache גלובלית | ⏸️ **הוחלט לא לבצע** — `?v=N` פר-קובץ עדיף ל-caching (רק קובץ ששונה נטען מחדש). גרסה גלובלית = כל הקבצים נטענים מחדש בכל שינוי. לשקול רק אם קונפליקטים על מספרי-גרסה ב-branches מקבילים ייהפכו לכאב אמיתי | — |

---

## 5. רשת ביטחון
- כל שינוי = commit נפרד. חזרה: `git revert <sha>` או checkout לקומיט קודם.
- גיבוי מלא: `מחברת-backup-2026-06-03/`.
- אחרי כל שינוי: `node --check` + סריקת הפניות + בדיקה חיה (preview port 7788) + אפס שגיאות קונסול.

---

## 5א. קבצים מצורפים בענן (`js/features/cloud-files/`, `window.CloudFiles`) — Firestore-chunked (יולי 2026)

> קובץ שמדביקים במחברת (PDF/Word/וכו') מאוחסן ב-**Firestore, מפוצל ל-chunks** — **לא ב-Storage**.
> הנושא שומר רק הפניה קטנה `data-fs="{id}"` (בלי base64). כך הקובץ באמת עולה לענן וזמין מכל מכשיר.
> **⛔ אין קשר לתמונות** — נתיב שמירת התמונות (`media.js insertImage`/`Editable`) לא נגע.

**למה Firestore ולא Storage (השורש שנפתר סופית):** האתר ב-**GitHub Pages** (לא Firebase Hosting),
ול-bucket של Storage **אין כלל-CORS** למקור `https://gagula22.github.io` — כל העלאה נחסמה
(`blocked by CORS policy` → `net::ERR_FAILED` → נפילה מקומית; **לא Brave**). לתקן CORS דורש
`gsutil` על ה-bucket, אבל `my-notebook-b5229` אינו נגיש בחשבון של המשתמש → תקוע שבוע. **Firestore
לא זקוק ל-CORS ומסתנכרן חלק** (כמו שאר הנתונים) → זו הדרך היחידה שמבטיחה העלאה אמיתית בלי הגדרת-שרת.
זה גם ייתר את הצורך הדחוף במעבר-בקאנד (ראה `MIGRATION-b5229-to-26ff5.md` — עכשיו אופציונלי).

- **מבנה Firestore:** מסמך-מטא `users/{uid}/attachments/{id}` = `{name,type,size,mime,chunks:N,createdAt}`
  + תת-אוסף `parts/{i}` = `{b:"<base64 של ~900KB>"}`. מגבלת 1MB למסמך → פיצול ל-chunks (900KB = המקסימום
  הבטוח מתחת ל-1,048,576 עם מרווח ל-path/overhead). המטא נכתב **אחרון** → מטא שלם מבטיח שכל ה-parts
  קיימים. **תקרה:** `CloudFiles.FS_MAX`=20MB (מעבר → מקומי).
- **ביצועים (מהירות + איכות):** ה-parts נכתבים ונקראים **במקביל** (`CONCURRENCY`=5 lanes, אותו דפוס
  כמו תמלול-הקול) — חופף round-trips ומקצר את הזמן מ-N סדרתי ל-~ceil(N/5) גלים (נמדד: 5MB≈2.2× מהיר
  מסדרתי). המחיקה = `writeBatch` אטומי יחיד (מטא+כל ה-parts, round-trip אחד). round-trip byte-identical אומת.
- **⚠️ מחוץ ל-Store/סכימה בכוונה (decoupled):** cloud-files קורא/כותב את אוסף `attachments` **ישירות**,
  לא דרך מנוע-הסנכרון (SUBCOL_KEYS). כמו הקלטות-קול ב-IndexedDB — אחסון כבד שלא מנפח snapshot ה-Store.
  **אין מפתח store-schema, אין אסרציית firebase-sync.** כלל-ההרשאה הקיים `match /users/{uid}/{document=**}`
  (רקורסיבי) מכסה את `attachments/**` — **אין צורך בשינוי כללים** (וכללי ה-Storage הישנים כבר לא רלוונטיים).
- **API:** `enabled()` = SDK+firestore+משתמש-מחובר · `fits(size)` · `upload(file,id,onProgress)`→`{id,name,type,size,fs:true}`
  (מפצל, כותב parts **במקביל** עם התקדמות, מטא אחרון) · `fetch(id,onProgress)`→`{dataUrl,name,type,size}`
  (קורא מטא+parts **במקביל**, מרכיב) · `remove(id)` (batch אטומי, best-effort).
- **`media.js insertFileAttachment`:** מחובר+בטווח → placeholder → `upload` → כרטיס עם `data-fs`.
  לא-מחובר/מעל-תקרה/כשל → נפילה חיננית ל-base64 מקומי (`data-content`) — כלום לא נשבר.
- **`openAttachment`/`downloadAttachment`:** `data-fs` → `CloudFiles.fetch` (טוען chunks) → **Blob URL**
  (data-URI ב-iframe נכשל על קבצים גדולים = הבאג "טאב ריק"; Blob URL עובד) → תצוגה/הורדה. תאימות-לאחור:
  `data-url` (קבצי-Storage ישנים) עדיין נפתחים; `data-content` (base64 מקומי) עדיין נפתח.
- **הבאג "קובץ נעלם אחרי רענון" (§6, מגן-המדיה):** לא רלוונטי לקבצי-Firestore — הנושא שומר רק `data-fs`
  קטן (בלי base64), אז שומר-הגודל (`_sizeSafeTopic`) לא חותך כלום ומגן-המדיה הוא no-op עבורם.
- **⚠️⚠️ מלכודת קריטית — האצלה, לא חיווט פר-כרטיס:** כל האינטראקציות (⬇/×/dblclick) **מואצלות
  על אלמנט העורך** ב-`editor.js`, לא מחווטות פר-כרטיס. **למה חובה:** חיווט פר-כרטיס שסימן
  `data-wired=1` — הדגל **דלף ל-`topic.body` הנשמר**, ואחרי רענון החיווט-מחדש דילג על הכרטיס
  (`:not([data-wired])`) → הכפתורים מתים אחרי רענון. **כלל-מניעה: לעולם אל תחווט handler פר-אלמנט
  על תוכן שמסתדרל ל-Store; האצל על אב יציב (העורך).** הסרת כרטיס (× בעורך) קוראת `CloudFiles.remove(data-fs || data-path)`.

**היסטוריה (Storage — הוחלף):** הגישה המקורית (commit `82c393c`, `data-url`) העלתה ל-Firebase Storage
`users/{uid}/attachments/{id}-{name}`; נחסמה ב-CORS כמתואר למעלה ולכן הוחלפה ב-Firestore-chunking.
הקוד עדיין קורא כרטיסי-`data-url` ישנים לתאימות-לאחור.

## 5ב. תמונות-פתק בענן, ריפוי-קבצים וייבוא Word (P-12, ‏23.7.2026) — `notebook/media.js`

> שלוש יכולות שנוספו יחד סביב אותה בעיה: "רואים את התוכן רק במחשב אחד". כולן ב-`media.js`
> (חיווט ב-`editor.js`), משתמשות ב-`CloudFiles` של §5א, ו**מחוץ ל-Store/סכימה** באותה החלטה.

**א. תמונות-פתק כבדות → ענן (`convertHeavyImagesToCloud` + `hydrateCloudImages`):**
- **מתי:** מופעל מ-`saveImmediate` של העורך — כל שמירה, מכל מקור (הדבקה/ייבוא/צילום/הקלדה).
- **מה:** אם גודל **הגוף-שיישמר** > ‏800KB — התמונות הגדולות-תחילה עולות ל-CloudFiles (אותם
  Firestore-chunks) עד שהגוף ≤ ‏650KB. ה-`<img>` מקבל `data-fsimg="<id>"`; **בתצוגה** ה-src נשאר מלא;
  **בשמירה** `getCleanHTML` (editor.js) מחליף ל-placeholder ⇒ הגוף הרזה מסתנכרן מלא לכל המכשירים.
- **תצוגה:** `hydrateCloudImages` (בכל בניית-עורך + אחרי undo) מזריק src ממטמון IndexedDB מקומי
  (`hamachberet-imgcache`; נזרע בהמרה במקור ובשליפה בשאר ⇒ offline אחרי צפייה ראשונה) או מ-`CloudFiles.fetch`.
- **⚠️⚠️ מלכודת ה-placeholder:** חייב להישאר **SVG** (`nbMedia.FSIMG_PLACEHOLDER`) — מגן-המדיה (§6 sync)
  מזהה את ה-GIF-1×1 של שומר-הגודל כ"עותק חתוך" והיה **חוסם קבלת הגוף-המומר** במכשירים אחרים.
- **⚠️ מלכודת המדידה:** מודדים את הגוף-שיישמר — `innerHTML` פחות ה-src של כל `img[data-fsimg]`.
  מדידת DOM גולמי ⇒ "הגודל לא יורד" ⇒ המרת-יתר של הכול (נצפה 18/19 במקום 7).
- ההמרה עצמה **lossless** (מעלה את הבייטים המוצגים כמו-שהם); סבב ענן↔תצוגה זהה ביט-בביט.
- ייצוא Word/PDF לא מושפע — `exportDoc` משכפל את ה-DOM המוזרק (src מלא).

**ב. ריפוי-קבצים-מצורפים מקומיים (`upgradeLocalAttachments`):** בפתיחת-פתק, כרטיסי `data-content`
(מסלול-הנפילה; נחתכים מהענן ע"י שומר-הגודל ⇒ "לא רואה את הקובץ ממחשב אחר") מועלים ל-CloudFiles
ומוחלפים ל-`data-fs`. אידמפוטנטי (אותו data-att-id); ⚠️ מנעול+**מטמון-סשן** חובה — השמירה דחויה 500ms,
ו-rebuild באמצע קורא גוף ישן ומעלה שוב בלעדיו. מדלג על כרטיסים ריקים (העותק-החתוך) ו->20MB.

**ג. ייבוא Word לפתק (`importDocxInline`, כפתור 📥 בסרגל):** **הפתרון** ל"העתקה מוורד מאבדת תמונות" —
עובדה קבועה: וורד לא מוסר ביטי-תמונות ללוח בהעתקה מעורבת (רק `file:///`) ⇒ בלתי-פתיר דרך paste.
הזיהוי לפי **חתימת-בייטים** (לא סיומת): ‏`PK`→docx (mammoth, תמונות base64) · ‏`MIME-Ver`→MHTML
"Web Archive" (כולל קובצי-הייצוא-ל-Word שלנו!) — מפוענח מקומית: boundary-split, ‏HTML ב-quoted-printable,
תמונות base64 לפי Content-Location **וגם src יחסי** (`src="image001.webp"` — מה שהייצוא שלנו פולט) ·
‏`D0CF11E0`→doc-בינארי-ישן ⇒ הודעת שמור-בשם-docx. ההזרקה דרך `EditableImage.insertHtmlWithImages`
(=צינור-ההדבקה: ניקוי, דחיסה, figures) ⇒ התנהגות אחידה.

**מדיניות-איכות (`editable/utils.js compressImage`):** תמונה ≤~150KB ובתוך 2000px ⇒ מוחזרת **ביט-בביט**
(אפס קידוד-מחדש; הוכח מול חתימות מתוך docx אמיתי). מעל ⇒ סולם webp ‏q0.9→0.72 עם ירידת-מימדים
מדורגת עד 1280px (~2x רוחב-התצוגה 680px ⇒ חד). אל תחזירו קידוד-גורף — זה היה איבוד-דורי מיותר.

## 6. ייצוא מסמכים — פרטי מימוש (`notebook/export.js`, `window.nbExport`)

> כל מה שקשור לייצוא Word/PDF נמצא **רק כאן**. אל תיגע בעורך (`editor.js`) או בתמונות
> (`image.js`) כדי לשנות התנהגות ייצוא.

**צינור משותף (`exportDoc`)** בונה `body` HTML אחיד משני הפורמטים:
- **תמונות ברוחב מלא:** כל `figure.nb-img` מומר ל-`<table>` (העטיפה היחידה ש-Word שומר
  על עמוד אחד). ה-`<img>` מקבל **רוחב כפול**: `style="width:100%"` (לדפדפן/PDF) **וגם**
  `width`/`height` בפיקסלים = שטח התוכן של A4 (~670px). הכרחי כי **Word מתעלם מ-`%` על תמונות**
  ונופל לגודל הפיקסלים המקורי → גלישה. הדפדפן מתעלם מתכונות ה-px כי ה-`style` גובר.
- גופן 11pt, מעברי-עמוד (`nb-page-spacer` → `page-break-after`), שיטוח `<div>` → `<p>`.

**ייצוא Word (`format==='word'`):** Blob עם MIME `application/msword` + הוראות MSO.
גאומטריית A4 דרך `@page Section1` (שוליים 1.5 ס"מ) + עטיפת `<div class="Section1">`.
הורדה אוטומטית `<שם המחברת>.doc`.

> ⚠️⚠️ **סנכרון מדיה כבדה (תמונות **וקבצים מצורפים**) — מגן אובדן-מדיה ב-`firebase-sync.js`
> (P-03, תיקון יולי 2026 commit `bdcb8b4`).** תמונות **וקבצים** (`<span class="file-attachment"
> data-content="data:…">`) מוטמעים כ-base64 בגוף הנושא. Firestore מוגבל ל-1MB/מסמך, לכן
> `_sizeSafeTopic` מדלל את המדיה הכבדה לפני דחיפה (`_stripBase64Images`: תמונה→GIF 1×1,
> קובץ→`data-content=""`), והעותק המקומי המלא נשמר ב-IndexedDB. **המגן** (`_hasRealImage`/
> `preserveLocalImages`) מזהה עותק-ענן מדולל (`_imgStripped`) ו**שומר את העותק המקומי המלא**
> כדי שהוא לא יידרס. ⚠️ **קריטי — אל תצמצמו את השניים ל"תמונות בלבד":** זה בדיוק הבאג
> שקובץ מודבק "נעלם אחרי רענון" — כשה-strip והמגן לא כיסו `data-content`, הנושא נחתך ל-60KB
> בענן והֵד-הענן הקטוע דרס את המקומי. `_stripBase64Images` ו-`_hasRealImage` **חייבים** לכסות
> גם קבצים. (מגבלה מודעת: קובץ >900KB לא באמת עולה לענן — נשאר מקומי, כמו תמונה גדולה.)
>
> ⚠️⚠️ **תמונות ב-Word = MHTML. אל תחזירו ל-data-URI. (תיקון קבוע, יולי 2026, commit `09a44a1`).**
> **הבאג שחזר שוב ושוב:** כשהתמונות הוטמעו כ-`<img src="data:image/...;base64,…">` בתוך
> ה-Blob של ה-HTML — חלק מגרסאות Word הציגו **מסגרת שבורה** ("אין אפשרות להציג את התמונה
> המקושרת", X אדום), אחרות הציגו תקין. זה **הפורמט** שלא אמין ל-data-URI, לא באג נקודתי —
> לכן כל תיקון "החזיק" רק אצל חלק מהמשתמשים והבעיה חזרה. (PDF אף פעם לא נפגע כי הוא מרסטר.)
> **הפתרון הקבוע:** כשיש תמונות, `exportDoc` פולט **MHTML (multipart/related)** — בדיוק
> הפורמט ש-Word מייצר ב"דף אינטרנט בקובץ יחיד". ה-HTML מפנה לכל תמונה בשם יחסי
> (`image001.png`); כל תמונה = חלק-MIME נפרד בקידוד base64 עם `Content-Location` תואם.
> Word מטמיע כך תמונות **תמיד**. מסמך ללא-תמונות נשאר במסלול הישן הפשוט (HTML-as-.doc — לא נשבר).
> עוזרי-המודול: `_qpEncode` (quoted-printable לחלק ה-HTML — הפורמט הנטיבי של Word),
> `_buildMhtml`, `_chunk76`, `_mimeExt`. **בדיקה נכונה = לפתוח את ה-.doc המיוצא ב-Word עצמו,
> לא בדפדפן.** אל תפצלו את ה-HTML של Word חזרה ל-`<img>` עם data-URI — זו בדיוק הרגרסיה.

**ייצוא PDF (`format==='pdf'`):** **יצירת PDF אמיתי + הורדה אוטומטית** `<שם המחברת>.pdf`
(כמו Word, בלי חלון שמירה). `exportPdfFile` מאצל למנוע המשותף `window.HtmlToPdf.generate`
(`components/html-to-pdf.js`) — אותו מנוע משמש גם את כלי Word→PDF. מה המנוע עושה:
1. **טעינה עצלה** של `html2canvas` + `jsPDF` מ-CDN (`ensureLibs`, נטען פעם אחת).
   הספרייה המקומית `vendor/html2pdf` **שבורה** (דף ריק) — לא בשימוש.
2. **רינדור בפעם אחת** של כל התוכן ל-canvas יחיד עם **`width`/`windowWidth=680` מפורשים**.
   ⚠️ קריטי: בלי זה html2canvas חותך לרוחב ה-viewport → טקסט עברית נחתך בצד ושורות חופפות.
   רינדור בלוק-בלוק *גם* מעוות RTL — חייב פאס אחד.
3. **חיתוך לעמודים רק בגבולות בלוקים** (תחתית כל ילד ישיר): מעבר עמוד אף פעם לא חותך
   פסקה/תמונה. בלוק גבוה מעמוד → חיתוך קשיח (נדיר).
4. **fallback:** אם ה-CDN חסום (רשת עבודה) → `exportPdfViaPrint` (שמור-כ-PDF של הדפדפן,
   עם החלפת `document.title` לשם המחברת כברירת-מחדל).
- מגבלה ידועה: ב-PDF הטקסט הוא תמונה (לא בר-חיפוש). למי שצריך טקסט בר-חיפוש → Word.

**כלי Word→PDF (`tools/word-to-pdf/index.js`):** טוען .doc/.docx (mammoth → HTML, תמונות כ-base64),
מציג תצוגה מקדימה, וביצוא קורא ל-`HtmlToPdf.generate(..., {dir:'auto'})` — הורדה אוטומטית בשם
הקובץ, תמונות ברוחב מלא בלי חיתוך/גלישה. החליף את מודאל ההדפסה המסורבל הישן.

**כלי PDF→Word (`tools/pdf-to-word/index.js`):** מפיק **Word נערך** (HTML-as-.doc, application/msword).
חילוץ דרך PDF.js: `getTextContent` (טקסט+גיאומטריה) + `getOperatorList` (צבע/הדגשה/תמונות). משחזר
שורות→פסקאות/כותרות/רשימות, **צבע טקסט + הדגשות רקע** (מתאם מלבני-fill מ-operator-list מול תיבות הטקסט),
**Bold/Italic**, ותמונות מוטמעות במקומן (מפענח עמיד כולל 1bpp packed + ImageBitmap/JPEG).
⚠️ **זיהוי-אוטומטי:** PDF ללא שכבת טקסט (סרוק/מבוסס-תמונה, כמו ייצוא-PDF של המחברת) → לא ניתן לחלץ ממנו
טקסט; הכלי מזהה (`totalTextChars<12`), מטמיע את תמונות העמודים, ומציג הודעה ברורה שמפנה ל"ייצוא ל-Word"
של המחברת. *(נבנה ע"י workflow רב-סוכנים — מימוש מנצח שנבחר ע"י judge; ראה memory.)*

---

## 7. אחריויות חדשות (תוספות Fable 5) — כל אחת תיקייה עצמאית

> חמש אחריויות שנוספו ביוני 2026. כל אחת חיה בתיקייה משלה + CSS משלה + namespace משלה,
> והנגיעות היחידות בקבצים קיימים: שורת SECTIONS ב-app.js ותגיות ב-index.html.
> מנגנוני הרחבה רכים: `window.DASHBOARD_WIDGETS` (קיים) ו-`window.SETTINGS_CARDS` (חדש).

**ערכת נושא (`js/features/theme/`, `window.Theme`):** `boot.js` רץ סינכרונית ב-`<head>` לפני
ה-CSS — קורא מראה מ-`localStorage('mahberet.theme')` ומחיל `data-theme`/`data-fs` על `<html>`
לפני הציור הראשון (אפס הבזק). `index.js` — API (`set`/`setFontSize`), סנכרון דו-כיווני עם
`Store.settings` (Store מנצח אחרי `ready()` — מכסה ייבוא/שחזור), מצב `auto` שעוקב אחרי
`prefers-color-scheme`, עדכון `<meta theme-color>` ואירוע `themechange`. **כל ההתאמות לכהה
רק ב-`css/features/theme-dark.css`** — דריסת טוקנים תחת `[data-theme=dark]` + דריסות נקודתיות
לצבעים קשיחים של layout/components (אסור לערוך אותם). ⚠️ החלטת עיצוב: דף העורך וגוף ההערה
נשארים בהירים גם בכהה (טקסט שהמשתמש צבע חייב להישאר קריא).

**מסך הגדרות (`js/views/settings/index.js`, view `settings`):** שם משתמש (מזין את הברכה
הקיימת — `app.js` כבר קרא `settings.userName`), בורר ערכה, גודל טקסט. חושף את
**`window.SETTINGS_CARDS`** — מערך פונקציות-רינדור שמודולים אחרים דוחפים אליו כרטיס
(מקביל ל-DASHBOARD_WIDGETS, עם try/catch סביב כל כרטיס).

**לוח תובנות (`js/views/insights/`, view `insights`):** `charts.js` — 5 בוני גרפים קריאה-בלבד
(מצב רוח 30 יום, התמדה בהרגלים 8 שבועות, הוצאות לפי קטגוריה, הכנסות/הוצאות 6 חודשים, מים+שינה);
צבעים/פונט נקראים מטוקני CSS בזמן בנייה → כהה נכון אוטומטית. `index.js` — טעינה עצלה של
**Chart.js 4.4.3 (MIT, `js/vendor/chart.umd.min.js`, לעולם לא ב-index.html)**, וניהול חיים בלי
unmount-hook: הריסת גרפים בכל רינדור + `Store.subscribe` שבודק `document.contains` ומתנתק לבד
+ בנייה מחדש ב-`themechange`.

**חיפוש מהיר (`js/features/palette/index.js`, `window.Palette`):** לא view — אין שינוי ב-app.js.
Ctrl/Cmd+K ב-capture מכל מקום (העורך מיירט רק z/s/y/חצים — אין התנגשות); `/` רק מחוץ לשדות.
שלושה מקורות קריאה-בלבד: `App.sections` החי, `AsstEngine.searchContent` (מיחזור מנוע הבוט,
מדולג בשקט אם חסר), ופעולות מהירות. Esc סוגר עם stopPropagation (לא מפעיל יציאה ממצב מיקוד).

**קול (`js/features/voice/`):** `dictation.js` (`window.VoiceDictation`) — כפתור 🎤 מוזרק לסרגל
המחברת **בלי לערוך את המחברת**: MutationObserver על `#view` מאתר `.nb-ribbon:not([data-voice])`
בכל בנייה-מחדש ומוסיף קבוצה משלו (אידמפוטנטי; אם הסרגל ישתנה — הפיצ׳ר פשוט לא יופיע).
Web Speech he-IL; טקסט סופי דרך `execCommand('insertText')` → שמירה/undo של העורך בחינם;
ביניים בבועה צפה בלבד. `memos.js` (view `voice`, `window.VoiceMemos`) — MediaRecorder
(webm/opus→mp4 fallback), בלובים ב-**IndexedDB משלו (`hamachberet-voice`)** — אפס נגיעה
ב-Store/סכימה כדי שאודיו לא ינפח localStorage/סנכרון.
**שתי רובריקות (יולי 2026):** ה-view מציג שני כרטיסים — עברית (ברירת מחדל) ו-"🇬🇧 הערות
קול באנגלית". כל הקלטה נושאת `lang` ('he'/'en'; רשומות ישנות בלי שדה = 'he'), והרשימות
מסוננות לפי שפה.
**שני מקורות הקלטה (יולי 2026):** גוף ההקלטה חולץ ל-`beginRecording(stream, extraStream)`
המשותף ל-`startRec` (מיקרופון, getUserMedia עם echoCancellation) ו-`startTabRec` (שמע-טאב,
`getDisplayMedia({video:true,audio:true})` — לוקח רק את ה-audio track, שומר את סטרים-האב חי
כ-extraStream ועוצר אותו בעצירה; track `ended` → `stopRec`; אין audio track → toast מתקן).
כפתור "🔊 הקלט שמע מהטאב" בכל כרטיס (מוסתר בזמן הקלטה). מדריך ההפעלה מוצג בשני מקומות
מאותה `guideBody()`: חלון קופץ ב-hover/focus על הכפתור (`.vm-tab-pop`, נחשף דרך מחלקה
`vm-pop-open` ש-JS מוסיף ב-mouseenter/focusin + גיבוי `:hover`/`:focus-within` ב-CSS; נפתח
מתחת לכפתור כי הכרטיסים גבוהים בעמוד), ו-`<details>` מתקפל כגיבוי למגע בנייד (אין hover).
זהו הפתרון הנכון לתמלול סרטונים — המיקרופון קולט רמקולים גרוע וביטול-ההד מוחק את קול המחשב.
הקלטת אנגלית: `transcribe.js` מתמלל עם `language='en'` (ענן ומקומי),
מתרגם אוטומטית לעברית ושומר `memo.translation` — מקור ראשי **Google Translate** (endpoint חינמי
`gtx`, בלי מפתח, `_googleTranslateHe`), fallback ל-MyMemory דרך `window.PTR_ENGINE`.
⚠️ **תוקן 15.7.2026:** קודם השתמש ב-endpoint ‎`/translate` של ה-Worker (Llama-3) — אבל Cloudflare
**הוציאה את המודל משימוש ב-2026-05-30** (`5028: model deprecated`, HTTP 500) → כל תרגום נכשל
(ו-MyMemory נגמרה מכסתו). הוחלף ב-Google gtx (אמין, נגיש CORS גם מ-localhost); ב-15.7 הוחל אותו תיקון גם על כלי-הווידאו (P-44,
`VT_WORKER._translateText`, sl=auto לכל שפת-מקור). ייצוא Word של
הקלטת אנגלית = התרגום לעברית + המקור האנגלי (LTR) בהמשך המסמך; כפתור 🇬🇧 נוסף מייצא
מקור-בלבד; תרגום חסר מושלם על-פי-דרישה בלחיצת 📄. הקלטה אחת פעילה בכל רגע (שתי השפות).
**תמלול-ענן — המנוע המשותף (15.7.2026, transcribe v=11 · worker-api v=27):** מנוע-הנתחים המקבילי
(נתחי 90ש, 3 lanes, ניסיון-חוזר per-נתח עם backoff ‏2.5/5ש, המשך-חלקי — נתח שנכשל סופית מדולג,
`missing/total` מדווח; רק כשל-כולל זורק→מקומי) נכתב במקור בקול ו**הועבר ל-`VT_WORKER`** (בעלות P-44):
`_runChunkLanes` (גנרי) + `_transcribeViaWorkerParallel` (PCM). הקול (`cloudChunkedParallel`) וכלי-הווידאו
(נתיב PCM **ונתיב ה-MP3** ב-mp3.js) צורכים את אותו קוד — אין יותר שני עותקים. גם `VT_WORKER.WORKER_URL`
וקוד ה-Whisper-המקומי (`LOCAL_WHISPER_SRC`, עם `useBrowserCache:true` — המודל ~150MB יורד פעם אחת)
הם מקורות-אמת יחידים שם. ⚠️ אל תחזירו לולאת-נתחים טורית בלי retry ואל תשכפלו שוב את הכתובת/ה-src. **⚠️ מלכודת-התקיעה (15.7):** בקשת-רשת בלי timeout במנוע-הנתחים = תלייה של lane לנצח (בהקלטת 2-3ש, ‎90-120 נתחים, זה קרה בפועל — "התמלול נתקע"). כל העלאה עטופה עכשיו ב-AbortController עם `VT_WORKER.FETCH_TIMEOUT_MS` (3 דק'; מכסה גם את קריאת-התשובה; timeout-בזרימה זורק ישר ל-retry, לא ל-buffered). **כלל: כל fetch חדש במנוע חייב signal.** בצד-הקול: פענוח ארוך מציג שעון-חי (חוסר-חיווי נראה כתקיעה).
**פענוח חסכוני:** `_decodeLean` בקול (v=10) מחזיר **view** אל ה-AudioBuffer במקום העתקה מלאה →
שיא ~1.5GB→~690MB ל-3ש; ומאז 15.7 (`fa52be7`) גם `VT_AUDIO._decodeAnyFileToPcm` עצמו רזה ל-mono
(מחזיר `_buf` + view; סטריאו עדיין downmix-עותק). ⚠️ **מלכודת:** view אסור ב-transfer ל-Web-Worker —
מי שמעביר buffer חייב לוודא עותק (הנתיב המקומי בכלי מעתיק כשאין חיתוך; חיתוך/slice = כבר עותק).
⚠️ **הקלטה רציפה (יולי 2026, commit `65107d3`):** ההקלטה חיה ברמת המודול וממשיכה
במעבר עמוד/חלון עד עצירה מפורשת — `hashchange` עוצר **ניגון בלבד**; אסור להחזיר לשם
`stopRec()`. בזמן הקלטה מוצג שלט צף (`.vm-rec-pill`, בכל עמוד) עם טיימר + עצירה;
`renderView` נקשר ל-`_cards` חי (ui לכל כרטיס-שפה; `_recLang` קובע איזה כרטיס משחזר
מצב-הקלטה בחזרה לעמוד); `beforeunload` מזהיר לפני סגירת טאב (הצ'אנקים בזיכרון בלבד).
לכידת-טאב היא הקלטה רגילה לכל דבר (אותו `_mr`/pill/timer) — נשמרת ל-IndexedDB, מתומללת
ומיוצאת בדיוק כמו הקלטת מיקרופון.
**גיבוי-תמלולים לענן (`backup.js`, `window.VoiceBackup`, ‏15.7.2026):** ידני בלבד — כפתור ☁️ פר-הקלטה (⚠️ החלטת משתמש: אסור להפוך לאוטומטי). מגבה טקסט-בלבד למסמך Firestore יחיד `users/{uid}/voice-transcripts/{id}` בכתיבה ישירה — **מחוץ ל-Store/סכימה בכוונה** (כמו attachments של P-12: אין מפתח סכימה, אין אסרציית sync; הכלל הרקורסיבי מכסה). שומר-גודל: >900KB ⇒ מוותרים על transcriptChunks. `memo.backedUpAt` = סטטוס מקומי; תמלול-מחדש מוחק אותו. set() מאושר-שרת ⇒ "גובה ואומת" אמיתי.

**גיבוי אוטומטי (`js/features/autobackup/index.js`, `window.AutoBackup`):** צילום יומי מלא של
`Store.get()` ל-IndexedDB משלו (`hamachberet-backups`), שמירת 14; שחזור = צילום-בטיחות ←
`Store.importJSON(File)` (המסלול המוכח של data-transfer) ← reload. UI = כרטיס ב-SETTINGS_CARDS
(תלות רכה — הגיבוי רץ גם בלי מסך ההגדרות).

---

## 8. עשר התוספות (יוני 2026) — אחריות נפרדת לכל אחת

> CSS של כולן ב-`css/features/extras.css` (בלוק נפרד לכל אחריות). עוזר משותף חדש:
> `js/components/topic-open.js` (`window.TopicOpen.open(tid)`) — פותח נושא מחברת מכל מקום
> דרך `window._nbWikiClick` שהמחברת חושפת. מפתחות Store חדשים (store-schema +
> עדכון האסרציה ב-firebase-sync): `readingList`/`flashcards` (subcol), `eisenhower`/`weeklyReviews` (maindoc).

- **קישורים-חוזרים** `js/features/backlinks/` — פאנל "מי מקשר לכאן" מוזרק ל-`.nb-stage` דרך
  MutationObserver (אפס עריכה במחברת); קישורים מפורשים (data-tid) + אזכורי-שם. הנושא הפעיל
  מזוהה מ-`.nb-topic.active` + `nbTree`. **אזכורים ללא קישור** = התאמת שם כ**מילה שלמה**
  (`mentionIndex`, גבולות עבריים ידניים כי `\b` של JS לא כולל עברית; מותרת קידומת עברית
  בודדת כמו ב/ל/ה) — מסנן אזכורי-שווא של אמצע-מילה; כל אזכור מציג **קטע-הקשר עם המילה
  מודגשת** (`<mark>`), בנוי מ-textNodes (בלי innerHTML — בטוח מהזרקה).
- **מפת קשרים** `js/views/graph/` (view `graph`) — SVG ידני: פריסת-כוחות, צמתים=נושאים,
  קשתות=ויקי+היררכיה, זום/הזזה דרך viewBox, לחיצה → TopicOpen.
- **"ביום הזה לפני…"** `js/features/onthisday/` — כרטיס DASHBOARD_WIDGETS: מצב רוח/הערות/נושאים
  מלפני שבוע/חודש/שנה (השוואת updatedAt מקומית).
- **סקירה שבועית** `js/views/weekly-review/` (view, מפתח `weeklyReviews`) — סיכום שבוע, רפלקציה,
  העברת משימות-יומן פתוחות +7 ימים (עיגון T12:00 — dateKey הוא UTC!). כתיבה ל-tasks = פעולת
  משתמש מפורשת (חריגה מתועדת).
- **מטריצת אייזנהאואר** `js/views/eisenhower/` (view, מפתח `eisenhower` = map todoId→רבע) —
  4 רבעים + מגירה, גרירה; סימון-בוצע כותב ל-todos (פעולת משתמש מפורשת).
- **לוח שרטוט** `js/views/sketch/` (view `sketch`) — Canvas API נקי (עט/קו/חץ/מלבן/עיגול/מחק,
  undo 30); "הוסף למחברת" = בורר נושא/מחברת-חדשה ← מוסיף `figure.nb-img` ל-body (התנהגויות
  התמונה של העורך נדבקות אוטומטית בפתיחה).
- **כרטיסיות זיכרון** `js/views/flashcards/` (view, מפתח `flashcards`) — חזרה מרווחת פשוטה:
  כישלון→מחר, הצלחה→המדרגה הבאה ב-[1,3,7,15,30,60,120].
- **מרכז הדגשות** `js/views/highlights/` (view) — DOMParser על topics+notes, חילוץ אלמנטים עם
  background-color אינליין (לא לבן), קיבוץ לפי מקור, קפיצה דרך TopicOpen/openNoteId.
- **סריקת מסמך** `js/views/tools/doc-scan/` (אריח בכלים, `window.Tools.docScan`) — מצלמה/קובץ ←
  Tesseract heb+eng מקומי (⚠️ נתיבי vendor חייבים להיות מוחלטים — `location.origin+…` — יחסיים
  נשברים בתוך ה-Worker) ← טקסט לעריכה ← בורר מחברת קיימת/חדשה-בשם ← עמוד-בן חדש (אייקון 📷).
- **רשימת קריאה** `js/views/readinglist/` (view, מפתח `readingList`) — קישור+כותרת+תגית,
  לשוניות לקריאה/נקראו/הכול.

---

## 9. מפת טיולים (`js/views/tripmap/`, view `tripmap`) — יוני 2026

> מפת ישראל בתלת־מימד + תצוגת רחוב + תכנון מסלולים. נבנה ע"י 3 סוכנים במקביל לפי
> חוזה ממשקים — **`js/views/tripmap/CONTRACT.md` הוא מקור-האמת לממשקים ולבעלות על
> הקבצים**; לפני כל שינוי שם — לקרוא אותו. CSS: `css/features/tripmap.css`. מפתח Store:
> `trips` (subcol, merge by-id).

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| ספקי אריחים (לוויין/רחובות/גבהים/מבנים), גבולות, ברירות מחדל | `tripmap/config.js` (`window.TripMapConfig`) |
| מנוע המפה: 2D/3D, terrain, markers, מסלולים | `tripmap/engine.js` (`window.TripMapEngine`) |
| תצוגת רחוב (overlay, Google embed, fallback) | `tripmap/street.js` (`window.TripMapStreet`) |
| ניווט גוף-ראשון במפה (WASD/חצים/Q/E/R/F) | `tripmap/controls.js` (`window.TripMapControls`) |
| פאנל הטיולים, ייבוא JSON, חיבור המתכנן | `tripmap/trip-layer.js` (`window.TripLayer`) |
| פריסת ה-view, סרגל צף, חיפוש Nominatim | `tripmap/index.js` |
| ניתוב נסיעה אמיתי (מסלול לפי כבישים כמו Waze) | `tripmap/routing.js` (`window.TripRouting`) — OSRM ציבורי |
| מאגר ידע הטיולים (אטרקציות/מסעדות/לינה/חו"ל) | `tripmap/planner-data.js` (`window.TripPlannerData`) |
| מנוע התכנון (לוגיקה טהורה, 4 מסלולים) | `tripmap/planner-engine.js` (`window.TripPlannerEngine`) |
| אשף התכנון + מסך התוכנית + ייצוא/הדפסה | `tripmap/planner-ui.js` + `css/features/tripplanner.css` (`window.TripPlannerUI`) |

**מתכנן הטיולים עצמאי לחלוטין — אפס תלות ב-LLM.** האשף (planner-ui) מציג את כל
אפשרויות הסקיל trip-planner-metakhnen-tiyulim כ-UI: 4 מסלולים (בארץ/חו"ל/חופשה
קצרה/הפתע אותי), המנוע (planner-engine) מחולל תוכנית יום-יום אמיתית מתוך מאגר הידע
(planner-data: 122 אטרקציות עם קואורדינטות אמיתיות שאומתו מול Nominatim, 46 מסעדות,
40 לינה, 12 יעדי חו"ל, 38 ערי-מוצא). טיול בארץ מתחיל מ**נקודת מוצא** (עיר המגורים,
שדה ראשון באשף, נשמרת ב-localStorage): המנוע מחשב מרחק/זמן-נסיעה ממנה לאזור
(haversine×1.3 ÷ 75 קמ"ש) ומשבץ ב-overview וב-transport של יום 1. טיול בארץ נשמר עם עצירות ומוצג על המפה; כל טיול מחזיק `doc`
(מסמך תוכנית מלא: ימים, תקציב, ציוד, צ'קליסט, טיפים) שנפתח מ-📄 בפאנל. הצמדת
surprise→abroad מעבירה הלאה את התשובות שכבר נבחרו (ימים/הרכב/חודש/תקציב). הסכמה
המקובעת של כל המודולים — ב-CONTRACT.md, סעיף "מתכנן הטיולים העצמאי".
**ייצוא והדפסה:** כל מסמך תוכנית מייצא ל-HTML עצמאי (CSS מוטמע, A4, RTL — נפתח בכל
דפדפן גם אופליין) ומדפיס דרך iframe נקי (buildStandaloneHTML/printDoc/exportDoc) —
לא דרך `@media print` על ה-DOM של האפליקציה, כך ההדפסה אף פעם לא משתבשת.

הערות מימוש: MapLibre GL v5 מאורז ב-`js/vendor/maplibre/` (טעינה עצלה + fallback CDN);
לוויין Esri (maxzoom 19), גבהים AWS terrarium, מבנים OpenFreeMap fill-extrusion.
⚠️ maplibre-gl.css נטען עצלה אחרי tripmap.css וקובע `.maplibregl-map{position:relative}`
— לכן המפה ממוקמת עם `.tm-view > .tm-map` (ספציפיות גוברת). תצוגת רחוב: Google Maps
embed ללא מפתח (`/maps/embed?pb=!6m7…`) — ה-endpoint היחיד בלי X-Frame-Options.
ייבוא טיול מהסקיל trip-planner-metakhnen-tiyulim: פרומפט מוכן + הדבקת JSON
(סכמה: title/region/days[n,title,stops[name,lat,lng,time?,note?,type?]]).
**ניתוב נסיעה אמיתי:** בהצגת טיול על המפה כל יום מנותב לפי כבישים דרך OSRM הציבורי
(`routing.js`) — גאומטריה אמיתית במקום קו אווירי, מסלול חלופי מקווקו כשזמין, ובועת
סיכום (מרחק/זמן/מספרי-כבישים) בקליק על "יום N". כשל רשת → נפילה לקו אווירי. המפה
ממוקדת על העצירות דרך `handle.fitBounds`.

---

## 10. ניתוח לפי וויקוף (`js/views/wyckoff/`, view `wyckoff`) — יוני 2026

> ⚠️ **שני כלי-וויקוף נפרדים — לא לבלבל:**
> - `js/views/dashboard/wyckoff/` (ישן) — כרטיס סחר מבוסס **Cloudflare Worker** שדורש
>   **TradingView מותקן** (לכידת גרפים). order=10 בדשבורד.
> - `js/views/wyckoff/` (חדש, "ניתוח לפי וויקוף") — **עצמאי, ללא תוכנה, מ-Binance חי**,
>   מנוע-חוקים בדפדפן. order=15. **מקור-אמת מלא: `js/views/wyckoff/CONTRACT.md`** (כולל
>   ממשקים, יומן פיתוח, נקודות המשך).

מפיק **דוח 3 מטבעות (BTC·ETH·SOL)** בתבנית ה-HTML/CSS המדויקת של הסקיל wyckoff-analyzer,
רץ 100% בדפדפן (אפס תלות בקלוד/בשרת). מודולים: `data.js` (Binance), `engine.js`
(מנוע-חוקים: SC/AR/טווח/V1%/צ'ק-ליסט/פסיקה/תרחישים), `chart.js` (`draw`+`scenario`),
`index.js` (view+דוח+ייצוא+כרטיס דשבורד), `css/features/wyckoff.css`. ה-CSS של הסקיל
גלובלי — ממוקד תחת `.wk-report` בתצוגה החיה, ולא-ממוקד ב-EXPORT_CSS לקובץ העצמאי.
נגיעות משותפות: SECTIONS ב-app.js, מיון `fn.order` ב-dashboard/index.js, tooltip+order
בכרטיס הישן. ⚠️ אסור לכתוב לתיקיית `wyckoff/` (של הכלי הישן).

## 11. קיבוץ הניווט (`js/features/navmode/` + `js/components/sidebar.js` + `js/views/hub/`) — יוני 2026

מאגד את הכלים ל**קבוצות** לפי נושא, מבלי לשנות אף `view`. אפס שינוי בקוד ה-views —
הקיבוץ נגזר משדה `group` של ה-SECTIONS ב-app.js בלבד.

- **`js/features/navmode/index.js` (`window.NavMode`)** — מקור-האמת לקבוצות. מגדיר
  `GROUPS` (כיום **חמש**, יולי 2026 — commit `e594e04`) ו-`BUNDLES` (כלי-אב עם לשוניות-משנה):
  - 🗓️ **המרכז היומי** (`daily`): יומן · צרור *משימות* (רשימה + מטריצת סדר יום) ·
    צרור *מעקב יומי* (מצב רוח + שתייה ושינה + הרגלים) · מטרות.
  - 📚 **ידע ולכידה** (`knowledge`): הערות · לוח שרטוט · מרכז הדגשות · כרטיסיות זיכרון · הערות קול · רשימת קריאה · **תורות, חוקים ומשפטים** (P-39).
  - 💰 **כסף ותובנות** (`money`): תקציב · תובנות.
  - 📄 **מסמכים ויצירה** (`docs`): סטודיו מסמכים · מעבדת דשבורדים · נווט שוק העבודה · כלים.
  - 🤖 **עוזרי AI** (`ai`): ארגז PM · סטודיו חיפוש · פרומטים · עוזר חכם.
  - נשארים פריטים בודדים (flat): לוח בקרה · מחברת · מפת קשרים · סקירה שבועית · מפת טיולים · ניתוח וויקוף · הגדרות.
  - API: `groups()`, `groupById(id)`, `groupChildren(id)`, `groupOf(sectionId)`,
    `bundles()`, `bundleById(id)`, `get()/set()`. מצב נשמר ב-`localStorage` (`mahberet.navMode`).
- **`sidebar.js`** — מרנדר N קבוצות לפי `NavMode.get()`: `flat` (כל כלי בנפרד) /
  `group` (קבוצה מתקפלת, מצב פתוח לכל קבוצה ב-`mahberet.open.<groupId>`) /
  `hub` (פריט אחד → עמוד-מרכז). `setActive` מודע לנתיבי `#/bundle/<id>` ו-`#/hub/<groupId>`.
- **`js/views/hub/index.js`** — שני נתיבים נסתרים (navHidden): `#/hub/<groupId>/<child?>/<member?>`
  (עמוד-מרכז עם לשוניות לכל קבוצה; צרור → לשוניות-משנה) ו-`#/bundle/<id>/<member?>` (צרור בודד).
  מארח את ה-views הקיימים דרך `App._routes[id]` — רינדור עצל של הלשונית הפעילה בלבד (אפס עלות ביצועים).
- **שליטת משתמש:** כרטיס "🧭 סגנון התפריט" בהגדרות (נרשם דרך `window.SETTINGS_CARDS`).
- **כדי להוסיף/לשנות קבוצה:** עורכים `GROUPS` ב-navmode ומסמנים `group:'<id>'` ב-SECTIONS. זהו.
- **⚠️ מלכודת (9.7.2026, P-39):** למרות ההערה ב-app.js ("navmode קורא את שדה `group`"), שדה `group` ב-SECTIONS
  **לבדו אינו מוסיף פריט לסרגל** — `sidebar.js` במצב `group` מרנדר אך ורק מה שרשום ב-`GROUPS[].children` של navmode.
  להוספת view לקבוצה חובה **שני שלבים**: (1) שורת SECTIONS עם `group:'<id>'` ב-app.js (לזיהוי הנתיב והכותרת);
  (2) רשומת `{ view:'<id>', title, icon, color }` ב-`children` של הקבוצה ב-`navmode/index.js`. בלי (2) הפריט קיים
  בנתיב אך נעלם מהסרגל.

---

## 12. תרגום ספרי PDF על גבי התמונה (`js/views/tools/pdf-book-translator/`) — יוני 2026

> כלי עצמאי לחלוטין שמשחזר בדפדפן את הסקיל `hebrew-image-overlay-translation` —
> **אפס Claude, אפס מפתח Store, אפס CSS משותף** (סגנונות inline). הנגיעות היחידות
> בקבצים קיימים: אריח ב-`stickers.js`, שתי תגיות `<script>` ב-`index.html`, ורשומת
> HELP ב-`assistant/knowledge.js` (`tool-book-translate`).

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| הצנרת: רינדור עמוד, OCR+תיבות-גבול, תרגום, ציור overlay, הרכבת PDF | `pdf-book-translator/engine.js` (`window.PBT_ENGINE`) |
| ה-UI, טווח עמודים, התקדמות/ביטול, בורר-תיקייה ושמירה | `pdf-book-translator/index.js` (`window.Tools.pdfBookTranslator`) |

**הצנרת (עצמאית, מקומית):** כל עמוד מרונדר ל-canvas (pdf.js) → OCR מקומי עם תיבת-גבול
לכל פסקה (Tesseract.js v5 המאורז ב-`js/vendor/tesseract`, שפת `eng`) → תרגום EN→HE של כל
פסקה דרך **MyMemory** (אותו שירות של כלי "תרגום PDF") → כיסוי הטקסט האנגלי במלבן בצבע-רקע
**נדגם מהתמונה** וציור העברית מעליו ב-RTL, עם **התאמת גודל פונט וריווח-שורות כדי למלא את
מסגרת הבלוק** (מקביל ל-`fill_column` בסקיל) → הרכבת כל העמודים ל-PDF (pdf-lib המאורז).
מספרים/מחירים/תאריכים/סמלים מדולגים (`shouldSkip`) ונשמרים כמו במקור — וכן תוויות
שלבים (Phase A/B/C/D), לפי העדפת משתמש.

**שדרוג v=2 (פורט משיפורי צנרת-השרת `pbt_test_out/`):** (א) **דגימת-רקע חסינה** —
`dominantBg` מחזיר את הצבע הדומיננטי (mode) על פני פנים הבלוק במקום פיקסל-בודד, חסין
לקווי-רשת/רווחים שגרמו לטקסט-לבן לצאת בלתי-נראה. (ב) **כיסוי תיבה-צבעונית מלאה** —
`colorBoxBounds` מוצא את גבולות המלבן הצבעוני בפרופיל-צפיפות לפי שורות/עמודות (חסין
לטקסט-פנימי), כדי שלא יישארו שאריות אנגלית. (ג) **שומר-ניגודיות** — אם הדיו קרוב מדי
בבהירות לרקע, נכפה קוטב הפוך + `console.warn`. אומת: 11/11 בדיקות-יחידה + מבחן-canvas חי.

**שמירה:** התוצאה נשמרת לתיקייה שהמשתמש בוחר דרך **File System Access API**
(`showDirectoryPicker`); דפדפן בלי תמיכה → נפילה להורדה רגילה לתיקיית ההורדות.

**קריטי:** ⚠️ נתיבי Tesseract חייבים להיות מוחלטים — המנוע מחשב `appBase()` מ-`location.href`
(תומך בתת-נתיב כמו `/hamachberet-sheli/`), לא `location.origin` (שנשבר בתת-נתיב). RTL על
canvas דרך `ctx.direction='rtl'` + `textAlign='right'` — **בלי** היפוך-ידני (הדפדפן עושה bidi,
כמו ש-raqm עושה ב-PIL; היפוך-כפול היה הופך את העברית). ⚠️ אומת חי: צינור OCR→תרגום→ציור→PDF
עובד מקצה-לקצה (Tesseract קרא נכון, MyMemory תרגם ושימר מספרים, pdf-lib הפיק `%PDF-`).
רינדור pdf.js עצמו זהה לכלי `pdf-translator`/`pdf-to-jpg` המוכחים.

## 13. פרומטים (`js/views/prompts/`, view `prompts`) — יוני 2026

עמוד אוסף פרומטים לשימוש חוזר, עם הוספה/עריכה/מחיקה ידנית מהממשק (אקורדיון מתקפל + חיפוש).
- `js/views/prompts/index.js` — `BUILTIN[]` = פרומטים מובנים (קריאה בלבד, תג "מובנה");
  פרומטי המשתמש נשמרים ב-`Store('prompts')` עם טופס הוספה/עריכה וכפתור מחיקה. המשתמש מוסיף
  פרומטים בלי שום שינוי קוד.
- `css/features/prompts.css` — עיצוב (טוקנים → תומך מצב כהה), טופס, כפתורים מוקטנים, כפתור-ראשי מתוחם לעמוד.
- **⚠️ שינוי סכימה (חשוב לסוכן הבא):** נוסף מפתח `prompts` ב-`store-schema.js`
  (`sync:'subcol'`, `merge:'by-id'` — מסונכרן, מגובה, additive-only כך שנתוני ענן לא נדרסים).
  כל מפתח subcol חדש חייב להופיע **גם** במערך ה-assertion `sub` ב-`firebase-sync.js` —
  אחרת ה-assertion זורק בכוונה ומגן על הנתונים. הוסף בשני המקומות יחד.

## 14. מלכודת בחירה בעורך המחברת (`notebook/editor.js`) — יולי 2026

> ⚠️ **הבאג שחזר וכדאי שלא יחזור שוב:** "כל הפקודות והלחצנים בעורך לא עובדים" (בעיקר
> בטלפון) — לוחצים B/I/U/צבע/כיוון ושום דבר לא קורה, או שהעיצוב חל על טקסט אחר.

**מה היה השורש:** `exec()` תמיד שיחזר את `savedRange` על הבחירה החיה לפני `execCommand`.
אבל `savedRange` מתעדכן רק ב-`mouseup`/`keyup` של העורך, והופך ל**range "מת"** אחרי כל
עיצוב (ה-DOM נבנה מחדש — צומת הטקסט מוחלף ב-`<span>`, וה-range מצביע על צמתים מנותקים).
שחזור range מת מקריס את הבחירה → `execCommand` רץ על כלום. במגע ה-`mouseup` התופס לרוב
מוחמץ והנגיעה בלחצן מקריסה את הבחירה → כמעט כל לחיצה no-op.

**התיקון (commit `d24d8cb`, editor.js `?v=49`):**
1. `exec()` **מעדיף בחירה חיה** בתוך העורך; נופל ל-`savedRange` רק אם הבחירה החיה איננה
   **וגם** ה-range עדיין מחובר ל-DOM (`isRangeUsable`: `startContainer.isConnected` +
   `editor.contains(commonAncestorContainer)`).
2. `preventDefault` על `mousedown` של כל לחצני ה-ribbon (**לא** הבוררים — הם צריכים פוקוס).

**כלל מניעה — לכל toolbar עם `contenteditable` + `execCommand`:**
- לחצנים חייבים `preventDefault` על `mousedown` — לשמור את הבחירה חיה, לא להסתמך על שחזור.
- **אף פעם לא לשחזר Range שמור בעיוורון.** להעדיף בחירה חיה; לשחזר שמור רק אחרי אימות
  שהוא עדיין מחובר ל-DOM ובתוך העורך. Range שצמתיו הוחלפו = מת (`isConnected===false`).
- `applyToSelection` כבר בטוח (מעדיף בחירה חיה); אל תחזיר `sel.addRange(savedRange)`
  ללא-תנאי בשום כלי חדש — העתק את התבנית של `exec()`.
- **לאמת את המסלול הישן (stale), לא רק בחירה טרייה:** לשחזר ע"י בחירה **בלי** לירות
  `mouseup` על העורך ואז ללחוץ (מדמה מגע). בדיקת בחירה-טרייה עוברת גם כשהפיצ'ר שבור למשתמש.

**המשך (commit `22944de`, editor.js `?v=50`) — בוררי הצבע/הדגשה עדיין לא עבדו:** הפלטה
(`makeColorPicker`) מצורפת ל-`<body>`, **מחוץ ל-`.nb-ribbon`**, ולכן לא קיבלה את מגן
ה-mousedown של לחצני הסרגל. נגיעה בנקודת-צבע גזלה פוקוס והקריסה את הבחירה → `foreColor`/
`hiliteColor` על כלום. תיקון: `palette.addEventListener('mousedown', e=>e.preventDefault())`.
⚠️ **כלל:** כל פופאפ/פלטה/בורר שסרגל פותח ב-`<body>` חייב `preventDefault` על mousedown משלו —
מגן ממוקד-ribbon לא מכסה אותו. ⚠️ אירועים סינתטיים לא גוזלים פוקוס — לאמת עם
`evt.defaultPrevented===true` על mousedown בר-ביטול, לא רק שהפקודה חלה.

## 15. שטח מת בתחתית העורך — שני שורשים שונים (יולי 2026)

**שורש א' — בתוך עמודת העורך (commit `22944de`, notebook.css `?v=48`):** עמודת העורך
(`.nb-editor-col`) היא grid-item **בגובה מלא עם גלילה פנימית** (`height:100%`, סעיף
"4 ─ Editor column"). בנושא קצר זה השאיר שטח לבן מת מתחת לטקסט (שורת הסטטוס נדבקה הרחק
למטה). תיקון: `height:auto` + `min-height:0` + `max-height:100%` + `align-self:start` →
נושא קצר מתכווץ לגובה-תוכן, נושא ארוך עדיין נחסם ל-100% וגולל פנימית. ⚠️ `min-height:0`
הכרחי — בלעדיו ה-grid-item שומר על גובה ה-track המלא. גם `.nb-editor` הוקטן:
`min-height 400→180`, `padding-bottom 80→28`.

**שורש ב' — פס מת של ~20% בתחתית *כל* האפליקציה (commit `b5d9e1f`, layout.css `?v=21`
+ notebook.css `?v=50`):** `layout.css` מחיל `html{zoom:0.8}` בדסקטופ, והדפדפן **לא מפצה
יחידות viewport על zoom** — כל גובה מבוסס `100vh` (body, ‎.sidebar, ‎.nb-layout) התרנדר
ב-80% מהחלון בלבד → פס לבן קבוע של ~20% בתחתית (188px בחלון 940). תיקון: משתנה
`--page-unzoom` מוגדר **צמוד לכלל ה-zoom** ב-layout.css (ברירת-מחדל 1 ב-`:root`; ‏1.25
באותה media query) וכל גובה vh מוכפל בו: `calc(100vh * var(--page-unzoom,1))`.

⚠️ **מלכודות שהתגלו בדרך (חשוב לסוכן הבא):**
1. **ה-zoom וה-`--page-unzoom` חייבים להישאר מסונכרנים** — שניהם רק ב-layout.css. משנים
   zoom? משנים גם את המשתנה (1/zoom). כל גובה `100vh`/`100dvh` חדש חייב `* var(--page-unzoom,1)`.
2. **`:root` גובר על `html`** (pseudo-class מול type selector) — הגדרת דריסת המשתנה על
   `html{}` בתוך ה-media query נכשלת בשקט; חייבים `:root{}` גם שם.
3. **מי שקובע בפועל את גובה המחברת** הוא הכלל בסקשן "Hide global topbar":
   `.main:has(.nb-layout) .nb-layout{height:...!important}` — ספציפי יותר ומאוחר יותר
   מכלל הגובה של סקשן 2 (שגם מחסיר `--topbar-h` מיותר — ה-topbar מוסתר במחברת). תיקון
   גובה המחברת חייב להיעשות **שם**.
4. **ה-Service Worker (stale-while-revalidate) מגיש עריכה ישנה באותו URL** — אחרי כל
   עריכת CSS/JS חובה להקפיץ `?v=N` **שוב**, גם אם כבר הוקפץ מוקדם יותר באותה סשן־עבודה
   (v=20 "נשרף" כך ונדרש v=21).
5. **מדידת layout בסביבת preview:** אנימציית `viewIn` (translateY 6px, ‏260ms) מוקפאת
   בטאב-רקע — offset של ~5px במדידות הוא ארטיפקט של הסביבה, לא באג.
6. **ריצוד + קפיצה-לראש ברינדור-מחדש (commit `a041e04`, app.js `?v=38` + notebook/index.js `?v=49`):**
   `App.render()` (app.js) בונה מחדש את כל `#view` (`innerHTML=''` ואז בנייה) בכל hashchange **וגם**
   בכל `onCloudUpdate` (הד-ענן) / `Store.ready` / `focusout`-דחוי. שתי מלכודות שנבעו מזה:
   (א) **ריצוד** — `render()` ניגן מחדש את אנימציית `viewIn` בכל קריאה, כולל render-במקום. **כלל:**
   לנגן את אנימציית-הכניסה **רק כשהסקשן משתנה** (`this._renderedSection !== section.id`), לא ב-render
   של אותו מסך. (ב) **קפיצה-לראש** — קריסת-המסמך-לריק בזמן `innerHTML=''` מאפסת את הגלילה. **כלל:** תצוגה
   שמרונדרת-מחדש-במקום חייבת **זיכרון-גלילה** משלה (notebook: `sessionStorage['nb.scroll']`;
   מעבר-נושא=ראש, הד-ענן/חזרה=שומר-מקום; persist לרענון + הזרעה כי הרענון מרנדר פעמיים).
   אל תסתמך על `history.scrollRestoration` — התוכן נבנה אסינכרונית אחרי IndexedDB.
7. **⚠️ למחברת יש שני "גוללים" — והם התחלפו בעבר בשקט (commit `ba4b6ca`, notebook/index.js `?v=50`):**
   בדסקטופ הפתק גולל **בתוך `.nb-editor-col`** (`overflow-y:auto` + `max-height:100%` — מאז
   תיקון ה-vh-unzoom הקאפ אמיתי, והחלון עצמו לא גולל כלל); במובייל (עד 600px) העמודה
   `overflow:visible` **והחלון** גולל. זיכרון-הגלילה של המחברת עוקב אחרי **שניהם**: מאזין
   `scroll` על `window` + מאזין **capture** ברמת document (scroll לא עושה bubble אבל כן capture —
   שורד כל rebuild) ששומר `{id, y, colY}`; `render()` מחזיר את שני הצירים עם retries קצרים
   (פתק עתיר-תמונות גדל בגובה תוך-כדי decode — scrollTo יחיד נחתך) שנעצרים ברגע שהמשתמש גולל.
   **כלל-מניעה:** כל שינוי CSS שמזיז את ציר-הגלילה של המחברת (overflow/height על
   `.nb-editor-col`/`.nb-layout`) חייב בדיקת זיכרון-גלילה — זה בדיוק מה ששבר את התיקון הקודם.

## 16. סטודיו מסמכים (`js/views/tools/doc-studio/`, view `docstudio`) — יולי 2026

> פורט עצמאי של הסקיל hebrew-doc-studio: מסמכים עסקיים בעברית, 100% בדפדפן, אפס LLM.
> commit `032ffbb`. פריט סרגל משלו (מעל "כלים").

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| תבנית (שדות/בונה-HTML), פלטות, גופנים, CSS-המסמך, מע״מ/סף-הקצאה | `doc-studio/templates.js` (`window.DS_DATA`) |
| תוכן "הוראות ההפעלה" (כללי + פר-תבנית) | `doc-studio/guide.js` (`window.DS_GUIDE`) |
| ייצוא PDF/Word/HTML | `doc-studio/export.js` (`window.DS_EXPORT`) |
| ה-UI: גלריה, טופס, תצוגה חיה, טיוטות, מודאל המדריך | `doc-studio/index.js` (`window.DocStudio`) |
| עיצוב הפיצ'ר (לא של המסמך!) | `css/features/docstudio.css` |

**מבנה:** 8 תבניות (הצעת מחיר, חוזה, מכתב, דוח, one-pager, חשבונית מס, קבלה, פרוטוקול)
כסכמות-שדות + פונקציות `build(data)→HTML` טהורות. הטופס נבנה גנרית מהסכמה; תצוגת A4
חיה = בדיוק ה-HTML שמיוצא (WYSIWYG אמיתי). חשבונית: מע״מ 18%, אזהרת מספר-הקצאה
אוטומטית מעל 5,000 ₪ לפני מע״מ (סף 1.6.2026 — לעדכן ב-`ALLOCATION_THRESHOLD` אם ישתנה).

**עקרונות שנשמרו:** אפס מפתח Store (טיוטות ב-IndexedDB עצמאי `hamachberet-docstudio`,
כמו הערות-קול) → אפס סיכון לסנכרון. ייצוא PDF דרך `window.HtmlToPdf` המשותף (רכיב מותר);
Word בדפוס application/msword+mso המוכח של `notebook/export.js` (מומש מקומית, לא מיובא —
כדי לא לצמד את שני המודולים). עיצוב המסמך (`.ds-doc`) מוזרק כ-`<style>` מ-`baseCss`
בכל שלושת היעדים (תצוגה/PDF/Word) — מקור-אמת עיצובי אחד.

## 17. מעבדת דשבורדים (`js/views/tools/file-dashboard/`, view `filedash`) — יולי 2026

> פורט עצמאי של הסקיל file-dashboard: קובץ → דשבורד, 100% בדפדפן, אפס LLM.
> commits `55bb19e` (מנוע) + `1107888` (UI). פריט סרגל מתחת ל"תובנות".

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| קריאת קבצים, זיהוי טיפוסי-עמודות, ריבוי-גיליונות | `file-dashboard/extract.js` (`window.FDX`) |
| הצעת זוויות, KPI, מפרטי גרפים, חוקי-תובנות | `file-dashboard/analyze.js` (`window.FDA`) — טהור, אפס DOM |
| רינדור הדשבורד, פלטות, מחזור-חיים של Chart.js | `file-dashboard/render.js` (`window.FDR`) |
| תוכן "הוראות ההפעלה" | `file-dashboard/guide.js` (`window.FD_GUIDE`) |
| ייצוא HTML עצמאי (גרפים→PNG) | `file-dashboard/export.js` (`window.FDE`) |
| ה-UI: העלאה, בחירת זווית/גיליון/פלטה | `file-dashboard/index.js` (`window.FileDash`) |
| עיצוב המעטפת (הדשבורד צבוע דינמית מהפלטה) | `css/features/filedash.css` |

**עקרונות:** "הזווית מובילה" — `suggestAngles` מציע רק שילובים שקיימים בנתונים (התחליף
ל-LLM, כמו אשף מתכנן-הטיולים); "אף מספר לא מומצא" — כל KPI/תובנה מחושבים מהשורות.
Excel דרך **SheetJS** (vendor חדש `js/vendor/xlsx.full.min.js`, טעינה עצלה + CDN גיבוי);
PDF/Word דרך pdf.js/mammoth הקיימים; Chart.js מאותו vendor של "תובנות" (בדיקת
`window.Chart` לפני טעינה — אין התנגשות). דגימה עד 20K שורות. אפס מפתחות Store.
⚠️ מודאל המדריך ממחזר את כיתות `ds-guide-*` מ-docstudio.css — שינוי שם שם ישבור גם כאן.

## 18. ארגז PM + סטודיו חיפוש ארגוני — מחוללי פרומפטים (יולי 2026)

> פורטים של שתי אפליקציות-עזר שנבנו בנפרד (תיקיות `PM-Toolkit/` ו-
> `Enterprise-Search-Studio/` שמחוץ לריפו — המקור נשאר שם). commit `1095fb3`.
> מודל שונה מ-P-45/P-46: אלה **מחוללי-דיוק** — הפלט הוא פרומפט/פקודה מנוסחים
> להדבקה אצל קלוד, לא תוצר סופי. שכבות הנתונים הועתקו מהמקור כלשונן.

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| סקילי PM (שדות/פרומפט/צ'קליסט), מסגרות, תבניות | `pm-toolkit/data.js` (`window.PMT_DATA`; עטיפת IIFE סביב המקור) |
| ה-UI של ארגז PM (גלריה/טופס/פלט/מדריך) | `pm-toolkit/index.js` (view `pmkit`, `window.PMKit`) |
| מקורות/מסננים/סקילים/נתוני-דמה של החיפוש | `search-studio/data.js` (`window.ES.data`; העתק verbatim) |
| בונה הפקודות + הדגמה + מדריך | `search-studio/index.js` (view `searchstudio`) |
| עיצוב שני הפיצ'רים (שני בלוקים בקובץ אחד) | `css/features/pmkit.css` |

**סינרגיה מותרת עם P-38 (פרומטים):** שני הפיצ'רים שומרים תוצרים ל-`Store('prompts')`
**בדיוק בסכימת הרשומה של עמוד הפרומטים** `{id, skill, title, body}` (unshift, additive).
אם עמוד הפרומטים ישנה את הסכימה — לעדכן את שתי נקודות הכתיבה כאן.
⚠️ שניהם ממחזרים את כיתות `ds-*` (טפסים/כרטיסים/מודאל) מ-docstudio.css — תלות מתועדת.

## 19. השלמות שלישיית docx/pdf/xlsx — חמישה כלים חדשים (יולי 2026)

> סגירת הפערים מול דף-היכולות של סקילי המסמכים של קלוד (skills-capabilities.html).
> commits `e68799c` (PDF) · `b73a665` (Word) · `94496a3` (אקסל+חיווט).

| כלי (אריח ב"כלים") | קובץ | נקודות מפתח |
|---|---|---|
| 💧 סימן מים | `pdf-ops/watermark.js` | עברית דרך canvas→PNG (לגופני pdf-lib אין עברית!) |
| 🔀 סדר עמודים מחדש | `pdf-ops/reorder.js` | `parseOrder` משלו — שומר סדר+כפילויות (parseRanges ממיין!) |
| 🖊️ מילוי טופס PDF | `pdf-ops/fill-form.js` | עברית = ציור PNG על מלבן ה-widget (עמוד לפי `widget.P()`); לטינית = שדה אמיתי |
| 📝 עריכת Word | `docx-edit/index.js` (P-49) | zip+XML (JSZip+DOMParser, ‏namespace ‏w:) — החלפה גלובלית, קבלת Track-Changes, חילוץ. מגבלה: ביטוי שפוצל בין ריצות לא יוחלף (מדווח) |
| 🧮 יוצר אקסל | `xlsx-maker/index.js` (P-50) | SheetJS עם **נוסחאות חיות** (`{t:'n',f:'SUM…'}`); 3 תבניות פיננסיות + טבלה חופשית |

**ידע שנצבר:** pdf-lib לא תומך הצפנת-סיסמה — יכולת ההצפנה שבדף-היכולות לא נוטמעה
(דורש qpdf-wasm כבד; מתועד כפער מודע). כלי ה-docx/xlsx משתמשים ב-`window.PdfOps`
(dropzone/download/status) — תלות רכה מתועדת ברכיבי העזר של P-42.

## 20. נווט שוק העבודה (`js/views/tools/job-nav/`, view `jobnav`) — יולי 2026

> פורט עצמאי של הסקיל job-market-navat-haavoda: מהחיפוש ועד החתימה, 100% בדפדפן,
> אפס LLM. commit `1501ca5`. פריט סרגל ליד "סטודיו מסמכים".

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| כל הדאטה (שכר/פלטפורמות/ראיון/זכויות/מו"מ/כללי-קו"ח/פרומפטים) | `job-nav/data.js` (`window.JOBNAV_DATA`) — פורט נאמן של SKILL.md + 3 ה-references |
| בונה הקו"ח (טופס, תצוגה חיה, ייצוא PDF/Word, מכתב מקדים) | `job-nav/cv.js` (`window.JobNavCV`) |
| ה-view: 4 המסלולים, המדריך, שמירה-לפרומטים | `job-nav/index.js` (`window.JobNav`) |
| עיצוב הפיצ'ר | `css/features/jobnav.css` |

**4 מסלולים:** קו"ח · תוכנית חיפוש · הכנה לראיון · שכר ומו"מ.
⚠️ **כלל הברזל של הסקיל מקודש בקוד (`cv.js`, פונקציית `ph()`):** שדה ריק בקו"ח → מוצג
כ-`[---למלא---]`, **לעולם לא ממציא** שם/מספר/חברה/הישג. הפורמט הישראלי נאכף: אין
תמונה/גיל/מצב-משפחתי, עמוד אחד, סדר הפוך. **עקרונות:** אפס מפתחות Store (טיוטה
ב-`localStorage('mahberet.jobnav')`); ייצוא PDF דרך `window.HtmlToPdf` המשותף ו-Word
בדפוס mso; שמירת פרומפטים ל-`Store('prompts')` בסכימת עמוד הפרומטים (כמו P-47/P-48).
נתוני שכר = טווחים ממוצעים; תפקיד שלא בטבלה → הכלי אומר זאת בכנות, לא ממציא. ⚠️ ממחזר
כיתות `ds-*` מ-docstudio.css (תלות מתועדת).
