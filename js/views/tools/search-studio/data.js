/* =====================================================================
 * data.js  —  שכבת הנתונים (Single Source of Truth)
 * אחריות: מחזיק את כל הנתונים הסטטיים של האפליקציה בלבד.
 *          הגדרות סקילים, מקורות, מסננים ונתוני הדגמה (mock).
 *          אינו מכיל לוגיקת UI או חישובים.
 * ===================================================================== */
window.ES = window.ES || {};

ES.data = (function () {
  "use strict";

  /* --- מקורות שניתן לחבר (קטגוריות MCP) --- */
  const sources = [
    { id: "chat",    icon: "💬", name: "צ'אט",            finds: "הודעות, שרשורים, ערוצים, הודעות פרטיות", examples: ["Slack", "Microsoft Teams", "Discord"] },
    { id: "email",   icon: "✉️", name: "מייל",             finds: "מיילים, קבצים מצורפים, שיחות",          examples: ["Microsoft 365", "Gmail"] },
    { id: "storage", icon: "📁", name: "אחסון ענן",        finds: "מסמכים, גיליונות, מצגות, PDF",          examples: ["Microsoft 365", "Dropbox", "Google Drive"] },
    { id: "wiki",    icon: "📚", name: "ויקי / מאגר ידע",   finds: "תיעוד פנימי, נהלים, runbooks",           examples: ["Notion", "Guru", "Confluence"] },
    { id: "tracker", icon: "✅", name: "ניהול פרויקטים",    finds: "משימות, תקלות, אפיקים, אבני דרך",        examples: ["Jira", "Asana", "Linear", "monday"] },
    { id: "crm",     icon: "🤝", name: "CRM",              finds: "לקוחות, אנשי קשר, הזדמנויות",            examples: ["Salesforce", "HubSpot"] }
  ];

  /* --- מסננים נתמכים בפקודת /search --- */
  const filters = [
    { key: "from",   label: "שולח / מחבר",  placeholder: "sarah",        hint: "from: — סינון לפי מי שכתב" },
    { key: "in",     label: "מיקום / ערוץ", placeholder: "engineering",  hint: "in: — ערוץ, תיקייה או מיקום" },
    { key: "after",  label: "מתאריך",       placeholder: "2025-01-01",   hint: "after: — רק תוצאות אחרי התאריך" },
    { key: "before", label: "עד תאריך",     placeholder: "2025-02-01",   hint: "before: — רק תוצאות לפני התאריך" },
    { key: "type",   label: "סוג תוכן",     placeholder: "doc",          hint: "type: — message / email / doc / thread / file" }
  ];

  /* --- שלושת הסקילים שמפעילים אתה (commands) + הפנימיים --- */
  const skills = [
    {
      id: "search", cmd: "/search", kind: "user", icon: "🔍",
      title: "חיפוש בכל המקורות בשאילתה אחת",
      tagline: "שאלה אחת שרצה במקביל על כל הכלים ומחזירה תשובה מסונתזת",
      features: [
        "מפרק את השאלה לכוונה, ישויות (אנשים/פרויקטים), טווחי זמן ומסננים",
        "מתרגם את החיפוש לתחביר הטבעי של כל כלי ומריץ הכל במקביל",
        "תומך במסננים: from: · in: · after: · before: · type:",
        "מדרג, מאחד כפילויות ומחזיר תשובה — לא רשימת תוצאות גולמית",
        "מתאים ל: מציאת החלטה · איתור מסמך · 'מי מבין ב-X' · סטטוס · שיחה ישנה"
      ],
      examples: [
        "/search what's the status of Project Aurora?",
        "/search from:sarah about:budget after:2025-01-01",
        "/search who knows about our Kubernetes setup?"
      ]
    },
    {
      id: "digest", cmd: "/digest", kind: "user", icon: "🗞️",
      title: "תקציר יומי או שבועי של כל הפעילות",
      tagline: "סורק את כל מה שקרה ומדגיש את מה שחשוב לך",
      features: [
        "טווחים: --daily · --weekly · --since <תאריך>",
        "מחלץ משימות לטיפול, החלטות ואזכורים שלך",
        "מקבץ לפי נושא/פרויקט — לא לפי כלי",
        "מושלם לחזרה אחרי חופשה או לפתיחת היום",
        "מסיים בסיכום מספרי: משימות, החלטות, אזכורים, עדכוני מסמכים"
      ],
      examples: [
        "/digest --daily",
        "/digest --weekly",
        "/digest --since Monday"
      ]
    },
    {
      id: "synthesis", cmd: "Knowledge Synthesis", kind: "auto", icon: "🧠",
      title: "סינתזת ידע — הרכבת התשובה הסופית",
      tagline: "הופך תוצאות גולמיות מכמה מקורות לתשובה אחת אמינה",
      features: [
        "איחוד כפילויות: אותה החלטה בצ'אט+מייל+מסמך → פריט אחד",
        "ייחוס מקורות: כל טענה מקושרת למקור (כלי, שולח, תאריך, כותרת)",
        "ציון ביטחון לפי טריות וסמכות (ויקי רשמי > מסמך > צ'אט)",
        "חשיפת סתירות במפורש במקום בחירה שקטה של גרסה",
        "מתאים את רמת הפירוט לכמות התוצאות (1-5 / 5-15 / 15+)"
      ],
      examples: []
    },
    {
      id: "strategy", cmd: "Search Strategy", kind: "auto", icon: "🧭",
      title: "אסטרטגיית חיפוש — המוח של המנוע",
      tagline: "פירוק שאלה והרצה רב-מקורית מקבילה",
      features: [
        "מסווג סוג שאלה: החלטה / סטטוס / מסמך / אדם / עובדה / זמן / חקירה",
        "מחליט בין חיפוש סמנטי למילות-מפתח ומייצר וריאציות (k8s / cluster)",
        "מנקד תוצאות: רלוונטיות, טריות, סמכות, שלמות — במשקלים לכל סוג",
        "מטפל בעמימות (שאלת הבהרה אחת) ובהרחבת שאילתה כשאין תוצאות"
      ],
      examples: []
    },
    {
      id: "sources", cmd: "Source Management", kind: "auto", icon: "🔌",
      title: "ניהול מקורות",
      tagline: "יודע מה מחובר, מדריך לחיבור ומנהל עדיפויות",
      features: [
        "מזהה אילו כלים מחוברים ומדריך לחבר חדשים בהגדרות MCP",
        "קובע סדר עדיפויות בין מקורות לפי סוג השאלה",
        "מודע למגבלות קצב (rate limit) — ממשיך עם שאר המקורות",
        "עוקב אחרי בריאות המקורות: ✓ זמין · ✗ לא מחובר · ⚠ מוגבל"
      ],
      examples: []
    }
  ];

  /* --- סוגי שאילתה ועדיפות מקורות (מתוך Search Strategy) --- */
  const queryTypes = [
    { id: "decision", label: "החלטה",  desc: "\"מה החלטנו לגבי...\"",   priority: ["chat", "email", "storage", "wiki", "tracker"] },
    { id: "status",   label: "סטטוס",  desc: "\"מה הסטטוס של...\"",     priority: ["tracker", "chat", "storage", "email", "wiki"] },
    { id: "document", label: "מסמך",   desc: "\"איפה המפרט של...\"",    priority: ["storage", "wiki", "email", "chat", "tracker"] },
    { id: "person",   label: "אדם",    desc: "\"מי עובד על...\"",       priority: ["chat", "tracker", "storage", "crm", "email"] },
    { id: "factual",  label: "עובדה",  desc: "\"מה המדיניות על...\"",   priority: ["wiki", "storage", "email", "chat"] }
  ];

  /* --- נתוני הדגמה (mock) לחיפוש --- */
  const mockSearch = {
    "aurora": {
      answer: "הצוות החליט ביום שלישי לעבור ל-REST על פני GraphQL בפרויקט Aurora. Sarah קיבלה את ההחלטה כי GraphQL היה מוגזם לצורך הנוכחי. ההחלטה אושרה במייל ומסמך העיצוב עודכן בהתאם.",
      confidence: "high",
      hits: [
        { source: "chat",    title: "שרשור #engineering", meta: "יום שלישי · 12 הודעות", snippet: "Sarah: בוא נלך על REST, GraphQL מוגזם לנו" },
        { source: "email",   title: "API Decision — מ-Sarah", meta: "יום רביעי", snippet: "מאשרת את גישת REST עם הנימוקים המלאים" },
        { source: "storage", title: "Aurora API Spec v3", meta: "עודכן יום רביעי", snippet: "סעיף 2 עודכן לשקף את החלטת ה-REST" },
        { source: "tracker", title: "משימה: סגירת גישת API", meta: "הושלם ע\"י Sarah", snippet: "סומן כהושלם" }
      ]
    },
    "kubernetes": {
      answer: "לפי היסטוריית ההודעות וכתיבת המסמכים, Alex ו-Priya הם אנשי הקשר ל-Kubernetes. ה-runbook המרכזי נמצא בויקי.",
      confidence: "medium",
      hits: [
        { source: "chat",    title: "הודעות על k8s ב-#infra", meta: "30 יום אחרונים", snippet: "Alex ענה על רוב שאלות הקלאסטר" },
        { source: "wiki",    title: "Kubernetes Runbook", meta: "מאת Priya", snippet: "ארכיטקטורה, סקיילינג ופתרון תקלות" },
        { source: "storage", title: "k8s Architecture.pdf", meta: "מאת Alex", snippet: "דיאגרמת הקלאסטרים והסביבות" }
      ]
    },
    "budget": {
      answer: "צוות הכספים מבקש את תחזיות Q2 עד יום שישי. Todd שיתף תבנית ב-#finance, והתבנית 'Q2 Budget Template' שותפה איתך ביום שני.",
      confidence: "high",
      hits: [
        { source: "email",   title: "בקשת תחזיות Q2", meta: "מצוות הכספים", snippet: "נא להגיש עד יום שישי" },
        { source: "chat",    title: "#finance — Todd", meta: "יום שני", snippet: "שיתפתי את התבנית, תמלאו בבקשה" },
        { source: "storage", title: "Q2 Budget Template", meta: "שותף יום שני", snippet: "תבנית גיליון לתחזיות" }
      ]
    }
  };

  /* --- נתוני הדגמה ל-digest --- */
  const mockDigest = {
    daily: {
      range: "10 ביוני 2026 · 24 שעות אחרונות",
      actions: [
        { text: "להגיש תחזיות Q2", from: "צוות הכספים", source: "email", due: "יום שישי" },
        { text: "לאשר את מפרט Aurora v3", from: "Sarah", source: "chat", due: "היום" }
      ],
      decisions: [
        { text: "נבחר REST על פני GraphQL ל-API", ctx: "שרשור #engineering", source: "chat" }
      ],
      groups: [
        { topic: "Project Aurora", items: [
          { source: "chat",    text: "שרשור סקירת עיצוב הסתיים — נבחרה Option B" },
          { source: "storage", text: "\"Aurora API Spec v3\" עודכן ע\"י Sarah" },
          { source: "tracker", text: "3 משימות עברו ל-In Progress, 2 הושלמו" }
        ]},
        { topic: "תכנון תקציב", items: [
          { source: "email",   text: "בקשת תחזיות Q2 עד יום שישי" },
          { source: "chat",    text: "Todd שיתף תבנית ב-#finance" }
        ]}
      ],
      mentions: [{ text: "תויגת בשרשור על שחרור הגרסה", source: "chat" }],
      stats: { actions: 2, decisions: 1, mentions: 1, docs: 1 }
    },
    weekly: {
      range: "4–10 ביוני 2026 · 7 ימים",
      actions: [
        { text: "לסיים סקירת קוד ל-PR #214", from: "Alex", source: "tracker", due: "מחר" },
        { text: "להגיש תחזיות Q2", from: "צוות הכספים", source: "email", due: "יום שישי" },
        { text: "לענות ללקוח על תקלת ההתחברות", from: "Support", source: "email", due: "השבוע" }
      ],
      decisions: [
        { text: "נבחר REST על פני GraphQL ל-API", ctx: "#engineering", source: "chat" },
        { text: "מעבר ל-PostgreSQL אושר ל-Q3", ctx: "#infrastructure", source: "chat" }
      ],
      groups: [
        { topic: "Project Aurora", items: [
          { source: "chat",    text: "החלטת REST התקבלה ואושרה" },
          { source: "storage", text: "מסמך העיצוב עבר 3 עדכונים" },
          { source: "tracker", text: "5 משימות נסגרו השבוע" }
        ]},
        { topic: "תשתיות", items: [
          { source: "chat",    text: "תוכנית מעבר ל-PostgreSQL פורסמה" },
          { source: "wiki",    text: "runbook חדש למסד הנתונים נוצר" }
        ]}
      ],
      mentions: [
        { text: "תויגת בדיון על ה-roadmap", source: "chat" },
        { text: "הוזכרת במייל סיכום הספרינט", source: "email" }
      ],
      stats: { actions: 3, decisions: 2, mentions: 2, docs: 4 }
    }
  };

  /* --- צעדי הזרימה (מהשאלה עד התשובה) --- */
  const flow = [
    "שאלה בשפה חופשית",
    "פירוק לתת-שאילתות",
    "חיפוש מקבילי בכל המקורות",
    "דירוג + איחוד כפילויות",
    "סינתזה עם מקורות"
  ];

  return { sources, filters, skills, queryTypes, mockSearch, mockDigest, flow };
})();
