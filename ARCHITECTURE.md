# ARCHITECTURE — מפת אחריות (Separation of Concerns)

> **העיקרון:** כל חלק = אחריות אחת ויחידה. כדי לשנות נושא מסוים — נוגעים **רק** בקובץ
> שאחראי עליו. אסור לערבב אחריות. שינוי בנושא אחד לא אמור לגעת בקוד של נושא אחר.
>
> **כלל עבודה:** לפני כל שינוי — מאתרים במפה למטה מי האחריות, ועובדים רק שם.

עודכן: יוני 2026 · ענף עבודה: `main` (הרפקטור מוזג והוטמע)

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
│       │   │   └── img-to-pdf.js      JPG/PNG→PDF (pdf-lib)               → window.Tools.imgToPdf
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
│       ├── stickers.js              מעטפת "כלים": hero + layout + register (קורא ל-window.Tools.*)
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
| עריכת טקסט במחברת (עורך, toolbar, undo, טבלאות) | `notebook/editor.js` |
| עץ הנושאים / סרגל צד של המחברת | `notebook/index.js` |
| כלי תמלול — לוגיקת אודיו / mp3 / whisper / ffmpeg | `tools/video-transcriber/<האחריות>.js` |
| כלי המרת PDF↔Word / תרגום PDF | `tools/<הכלי>/index.js` |
| יצירת קובץ PDF מ-HTML (מחברת + Word→PDF) | `components/html-to-pdf.js` (`window.HtmlToPdf`) |
| עיצוב המחברת | `css/features/notebook.css` |
| עיצוב משותף (כפתורים, כרטיסים) | `css/components.css` |
| מודל הנתונים — default/סיווג-סנכרון לכל key | `store-schema.js` |
| אחסון מקומי / לוגיקת מיזוג בענן | `store.js` · `firebase-sync.js` |
| UI של הסנכרון (באנר, סטטוס, כפתור, סרגל משתמש) | `firebase-ui.js` |

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
