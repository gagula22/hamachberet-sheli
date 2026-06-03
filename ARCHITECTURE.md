# ARCHITECTURE — מפת אחריות (Separation of Concerns)

> **העיקרון:** כל חלק = אחריות אחת ויחידה. כדי לשנות נושא מסוים — נוגעים **רק** בקובץ
> שאחראי עליו. אסור לערבב אחריות. שינוי בנושא אחד לא אמור לגעת בקוד של נושא אחר.
>
> **כלל עבודה:** לפני כל שינוי — מאתרים במפה למטה מי האחריות, ועובדים רק שם.

עודכן: יוני 2026 · ענף עבודה: `refactor/split-tools`

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
│   ├── firebase-sync.js             סנכרון ענן  (⚠️ עדיין מערבב auth+sync+UI — ראה "טרם הופרד")
│   │
│   ├── components/
│   │   ├── sidebar.js               ניווט  (⚠️ עדיין מכיל גם ייצוא/ייבוא — טרם הופרד)
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
│       │   ├── word-to-pdf/index.js          → window.Tools.wordToPdf
│       │   ├── pdf-to-word/index.js           → window.Tools.pdfToWord
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
| עיצוב המחברת | `css/features/notebook.css` |
| עיצוב משותף (כפתורים, כרטיסים) | `css/components.css` |
| נתונים / אחסון / סנכרון | `store.js` (מקומי) · `firebase-sync.js` (ענן) |

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
| `firebase-sync.js` → הפרדת auth-UI מלוגיקת הסנכרון | מעורבב | בינוני |
| `sidebar.js` → הפרדת ייצוא/ייבוא מהניווט | מעורבב | נמוך |
| איחוד שני מימושי `insertImage` (editable מול notebook/media) | כפילות — שורש באג צילומי-מסך | שינוי התנהגות — דורש אישור |
| `store-schema` — defaults + מטא-סנכרון פר-נושא | מרוכז ב-store.js+firebase-sync | גבוה — שכבת נתונים |
| גרסת cache גלובלית ב-index.html (במקום ?v=N פר-קובץ) | per-file | נמוך |

---

## 5. רשת ביטחון
- כל שינוי = commit נפרד (ענף `refactor/split-tools`). חזרה: `git checkout main`.
- גיבוי מלא: `מחברת-backup-2026-06-03/`.
- אחרי כל שינוי: `node --check` + סריקת הפניות + בדיקה חיה (preview port 7788) + אפס שגיאות קונסול.
