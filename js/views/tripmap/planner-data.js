(function () {
  'use strict';
  // ============================================================================
  // tripmap/planner-data.js  —  מאגר הידע של מתכנן-הטיולים העצמאי (בלי LLM)
  // ----------------------------------------------------------------------------
  // בעלות: סוכן D בלבד. namespace: window.TripPlannerData.
  // צורת הנתונים מקובעת ב-CONTRACT.md §"מתכנן הטיולים העצמאי". המנוע (planner-engine.js)
  // והאשף (planner-ui.js) צורכים את האובייקט הזה בלבד.
  //
  // קואורדינטות: אמיתיות. מדגם של כ-40 מקומות מפורסמים אומת מול Nominatim
  // (countrycodes=il, User-Agent תקין, השהיה ~1.1ש בין בקשות) ביוני 2026.
  // עלויות חו"ל וטיסות: הועתקו במדויק מטבלאות הסקיל trip-planner-metakhnen-tiyulim.
  //
  // אמנת שדות (תזכורת):
  //   cost: 0=חינם · 1=זול · 2=בינוני · 3=יקר
  //   kids: 'all' | '4+' | '8+' | 'teens' | 'no'
  //   seasons: ['spring','summer','autumn','winter']  (תת-קבוצה)
  //   price (מסעדה/חבילה): 1=זול · 2=בינוני · 3=יקר
  //   lodging.level: 'free' | 'budget' | 'mid' | 'premium'
  // ============================================================================

  var SP = 'spring', SU = 'summer', AU = 'autumn', WI = 'winter';
  var ALL = [SP, SU, AU, WI];

  // ──────────────────────────────────────────────────────────────────────────
  // 1) REGIONS — 10 אזורים (9 מטבלת הסקיל + מרכז/שפלה)
  // ──────────────────────────────────────────────────────────────────────────
  var regions = [
    { id: 'galil',     name: 'גליל עליון', center: { lat: 33.0414, lng: 35.5750 },
      seasons: [SP, AU, WI], desc: 'נחלים, יקבים, כפרים דרוזיים ושמורות טבע ירוקות.',
      audiences: ['family', 'couple', 'friends'] },
    { id: 'golan',     name: 'רמת הגולן', center: { lat: 32.9966, lng: 35.7000 },
      seasons: [SP, AU, WI], desc: 'מפלים, שמורות, יקבים ותצפיות פתוחות — אקטיבי ויפהפה.',
      audiences: ['family', 'couple', 'friends', 'solo'] },
    { id: 'kineret',   name: 'כנרת ועמקים', center: { lat: 32.8008, lng: 35.5890 },
      seasons: [SP, SU, AU], desc: 'חופים, שייט, אופניים ואתרים נוצריים סביב הים.',
      audiences: ['family', 'friends', 'couple'] },
    { id: 'haifa',     name: 'חיפה והכרמל', center: { lat: 32.7940, lng: 34.9896 },
      seasons: ALL, desc: 'גני הבהאים, ואדי ניסנאס, חופים וקיסריה הסמוכה.',
      audiences: ['couple', 'family', 'solo'] },
    { id: 'telaviv',   name: 'תל אביב והמרכז', center: { lat: 32.0809, lng: 34.7806 },
      seasons: ALL, desc: 'חוף, שווקים, מוזיאונים, אוכל וחיי לילה — העיר שלא נחה.',
      audiences: ['friends', 'couple', 'solo', 'family'] },
    { id: 'merkaz',    name: 'מרכז ושפלה', center: { lat: 31.8928, lng: 34.8113 },
      seasons: ALL, desc: 'אתרי מורשת, פארקים, מערות ואטרקציות משפחתיות נגישות.',
      audiences: ['family', 'friends'] },
    { id: 'jerusalem', name: 'ירושלים', center: { lat: 31.7780, lng: 35.2354 },
      seasons: [SP, AU, WI], desc: 'העיר העתיקה, מוזיאונים, שוק מחנה יהודה והיסטוריה בכל פינה.',
      audiences: ['couple', 'family', 'solo'] },
    { id: 'deadsea',   name: 'ים המלח', center: { lat: 31.2014, lng: 35.3639 },
      seasons: [SP, AU, WI], desc: 'ספא, מצדה, עין גדי וציפה במים המלוחים בעולם.',
      audiences: ['couple', 'family'] },
    { id: 'ramon',     name: 'מצפה רמון והנגב', center: { lat: 30.6120, lng: 34.8012 },
      seasons: [SP, AU, WI], desc: 'המכתש, שמי כוכבים נקיים, אבסיילינג ושקט מדברי.',
      audiences: ['couple', 'friends', 'solo'] },
    { id: 'eilat',     name: 'אילת והערבה', center: { lat: 29.5577, lng: 34.9519 },
      seasons: [AU, WI, SP], desc: 'שונית אלמוגים, דולפינים, מדבר ושמש כל השנה.',
      audiences: ['family', 'couple', 'friends'] }
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // 2) ATTRACTIONS — 12+ לכל אזור (סה"כ 120+). קואורדינטות אמיתיות.
  //    כללי-עונה: נחלים בצפון = חורף-אביב · מדבר/דרום = לא קיץ.
  // ──────────────────────────────────────────────────────────────────────────
  var attractions = [

    // ===== גליל עליון =====
    { id: 'banias', name: 'שמורת הבניאס', region: 'galil', lat: 33.2479, lng: 35.6936,
      type: 'nature', durationH: 3, cost: 2, kids: '4+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'מפל הבניאס המרהיב ומסלול מעיינות — אחד היפים בארץ.', tip: 'מסלול המפל קצר ומתאים לכל המשפחה; הגיעו מוקדם בסופ"ש.' },
    { id: 'teldan', name: 'שמורת תל דן', region: 'galil', lat: 33.2421, lng: 35.6454,
      type: 'nature', durationH: 2, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מקורות הירדן, מים זורמים בצל עצים — מרענן גם בקיץ.', tip: 'מסלול "עיון אליהו" נגיש לעגלות.' },
    { id: 'hula', name: 'אגמון החולה', region: 'galil', lat: 33.1080, lng: 35.5980,
      type: 'nature', durationH: 3, cost: 2, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מאות אלפי עגורים נודדים — חוויית ציפורים בלתי-נשכחת.', tip: 'שכרו עגלון או אופניים; הזריחה והשקיעה הן הזמן הקסום.' },
    { id: 'nimrod', name: 'מבצר נמרוד', region: 'galil', lat: 33.2527, lng: 35.7149,
      type: 'history', durationH: 2, cost: 1, kids: '4+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'המבצר הצלבני-איובי הגדול בארץ, תצפית עוצרת נשימה על החרמון.', tip: 'נעלי הליכה — יש המון מדרגות וטיפוס.' },
    { id: 'nahalsnir', name: 'שמורת נחל שניר (חצבני)', region: 'galil', lat: 33.2336, lng: 35.6210,
      type: 'water', durationH: 2, cost: 2, kids: '4+', seasons: [SP, SU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'הליכה בתוך נחל זורם וקר — מושלם ליום קיץ חם.', tip: 'נעלי מים חובה, הזרם חזק בחלקים.' },
    { id: 'metula', name: 'מטולה ומפל התנור', region: 'galil', lat: 33.2800, lng: 35.5780,
      type: 'nature', durationH: 2, cost: 1, kids: '8+', seasons: [WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'היישוב הצפוני בארץ ומפל התנור הסוער בעונת הגשמים.', tip: 'המפל מרשים בעיקר אחרי גשמים — חורף בלבד.' },
    { id: 'tzfat', name: 'העיר העתיקה צפת', region: 'galil', lat: 32.9646, lng: 35.5025,
      type: 'history', durationH: 3, cost: 0, kids: '8+', seasons: ALL,
      shabbatOpen: false, needsBooking: false, rainOk: true,
      desc: 'רובע האמנים, בתי כנסת עתיקים וסמטאות קבלה כחולות.', tip: 'הגלריות סגורות בשבת; חנו בכניסה ולכו ברגל.' },
    { id: 'roshpina', name: 'רחוב האומנים ראש פינה', region: 'galil', lat: 32.9682, lng: 35.5438,
      type: 'history', durationH: 2, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'מושבה ותיקה משוחזרת עם אבן, גלריות ובתי קפה מקסימים.', tip: 'שילוב מצוין עם ארוחת ערב רומנטית.' },
    { id: 'baram', name: 'גן לאומי ברעם', region: 'galil', lat: 33.0442, lng: 35.4147,
      type: 'history', durationH: 1.5, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'בית כנסת עתיק ומרשים מהמאה השלישית, מהשמורים בעולם.', tip: 'שקט ופחות עמוס מאתרים אחרים.' },
    { id: 'naotkedumim_galil', name: 'יער ביריה ומצפור', region: 'galil', lat: 32.9920, lng: 35.5050,
      type: 'view', durationH: 1.5, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'היער הנטוע הגדול בגליל — מסלולי הליכה ואופניים ומעיינות.', tip: 'נקודות פיקניק רבות, חינמי לגמרי.' },
    { id: 'dalton', name: 'יקב דלתון', region: 'galil', lat: 33.0210, lng: 35.4860,
      type: 'fun', durationH: 1.5, cost: 2, kids: 'no', seasons: ALL,
      shabbatOpen: false, needsBooking: true, rainOk: true,
      desc: 'סיור וטעימות באחד היקבים המוכרים של הגליל העליון.', tip: 'הזמינו מראש; נהג תורן חובה.' },
    { id: 'hahurshot', name: 'נחל עיון (תנור)', region: 'galil', lat: 33.2740, lng: 35.5790,
      type: 'water', durationH: 2.5, cost: 2, kids: '8+', seasons: [WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מסלול מפלים יורד לאורך הנחל עם מפל התנור בקצה.', tip: 'תיאום הסעה בין שתי הכניסות חוסך טיפוס.' },
    { id: 'manara', name: 'צוק מנרה ולונה-גל', region: 'galil', lat: 33.2010, lng: 35.5430,
      type: 'fun', durationH: 3, cost: 3, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'הרכבל הארוך בארץ, מגלשת הרים, אומגה ותצפית על העמק.', tip: 'יום שלם של כיף לכל המשפחה; קנו כרטיס משולב.' },

    // ===== רמת הגולן =====
    { id: 'gamla', name: 'שמורת גמלא', region: 'golan', lat: 32.9004, lng: 35.7512,
      type: 'nature', durationH: 3, cost: 2, kids: '8+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'המפל הגבוה בארץ, נשרים מרחפים ועיר מורדים עתיקה.', tip: 'מסלול המפל ארוך — מים וכובע; הנשרים בבוקר.' },
    { id: 'bental', name: 'הר בנטל', region: 'golan', lat: 33.1289, lng: 35.7856,
      type: 'view', durationH: 1, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'תצפית 360° מתוך עמדות צבא, אל החרמון ועמק הבכא.', tip: 'בית קפה "קופי אנן" בפסגה; קר ורוחני בחורף.' },
    { id: 'banias_golan', name: 'שמורת היהודיה', region: 'golan', lat: 32.9320, lng: 35.7100,
      type: 'water', durationH: 4, cost: 2, kids: 'teens', seasons: [SP, SU],
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'מסלול מים הרפתקני עם בריכות וקפיצות — קלאסיקה של הגולן.', tip: 'מסלול מאתגר; חובה להירשם מראש ולצאת מוקדם.' },
    { id: 'meshushim', name: 'בריכת המשושים', region: 'golan', lat: 32.9430, lng: 35.6920,
      type: 'water', durationH: 3, cost: 2, kids: '8+', seasons: [SP, SU],
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'בריכה קסומה מוקפת עמודי בזלת משושים — פלא גיאולוגי.', tip: 'הרישום מוגבל; הזמינו מקום מראש ברט"ג.' },
    { id: 'saar', name: 'מפל הסער', region: 'golan', lat: 33.1450, lng: 35.7050,
      type: 'nature', durationH: 1, cost: 0, kids: 'all', seasons: [WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מפל גבוה ונגיש מהכביש — עוצמתי בעונת הגשמים.', tip: 'תצפית קצרה; משלבים עם הבניאס הסמוך.' },
    { id: 'odem', name: 'יער אודם', region: 'golan', lat: 33.1700, lng: 35.7400,
      type: 'nature', durationH: 2, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'יער אלונים וגעש כבוי, פטריות וצבעי סתיו ואביב.', tip: 'מצוין לאופני שטח ופיקניק משפחתי.' },
    { id: 'hermon', name: 'אתר החרמון', region: 'golan', lat: 33.3030, lng: 35.7880,
      type: 'fun', durationH: 4, cost: 3, kids: 'all', seasons: [WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'אתר הסקי היחיד בארץ; בקיץ — רכבל ומסלולי הליכה.', tip: 'בחורף בדקו תנאי שלג מראש; השכרת ציוד באתר.' },
    { id: 'nimrod_golan', name: 'בריכת ברבור (אורטל)', region: 'golan', lat: 33.0400, lng: 35.7500,
      type: 'view', durationH: 1.5, cost: 0, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מאגר מים כחול בלוע הר געש, מוקף שדות ופריחה.', tip: 'נקודת תצפית שקטה ופחות מוכרת.' },
    { id: 'golanheights_winery', name: 'יקבי רמת הגולן (קצרין)', region: 'golan', lat: 32.9930, lng: 35.6890,
      type: 'fun', durationH: 1.5, cost: 2, kids: 'no', seasons: ALL,
      shabbatOpen: false, needsBooking: true, rainOk: true,
      desc: 'סיור וטעימות באחד היקבים הגדולים בישראל.', tip: 'הזמינו סיור מראש; שילוב מצוין עם בית הבד.' },
    { id: 'katzrin_ancient', name: 'כפר קצרין העתיק', region: 'golan', lat: 32.9870, lng: 35.6960,
      type: 'museum', durationH: 1.5, cost: 1, kids: '4+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'כפר תלמודי משוחזר עם בתים, בית כנסת ובית בד פעיל.', tip: 'חוויה לימודית מצוינת לילדים; יש פעילות.' },
    { id: 'gilabun', name: 'מסלול נחל גילבון', region: 'golan', lat: 32.9900, lng: 35.7300,
      type: 'water', durationH: 4, cost: 0, kids: 'teens', seasons: [WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מסלול עמוק עם שני מפלים גבוהים ובריכות — מאתגר ויפה.', tip: 'מסלול ארוך עם טיפוס בחזרה; ליציאה מוקדמת.' },
    { id: 'umm_el_qanatir', name: 'אום אל קנאטיר', region: 'golan', lat: 32.8170, lng: 35.6900,
      type: 'history', durationH: 1.5, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'בית כנסת עתיק מרהיב ששוחזר אבן-אבן בטכנולוגיה ייחודית.', tip: 'תצפית יפה אל הכנרת ממזרח.' },
    { id: 'jeep_golan', name: 'טיולי ג\'יפים בגולן', region: 'golan', lat: 33.0100, lng: 35.7200,
      type: 'fun', durationH: 3, cost: 3, kids: '4+', seasons: ALL,
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'טיולי שטח מודרכים בין מוצבים, מטעים ונופי בזלת.', tip: 'הזמינו מראש; חוויה אדירה גם לחורף בהיר.' },

    // ===== כנרת ועמקים =====
    { id: 'kineret_beaches', name: 'חופי הכנרת (דוגית/צמח)', region: 'kineret', lat: 32.7050, lng: 35.5870,
      type: 'beach', durationH: 4, cost: 1, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'חופים רגועים לרחצה, פיקניק ולינת שטח מול המים.', tip: 'חופים מוכרזים בלבד לרחצה בטוחה עם ילדים.' },
    { id: 'capernaum', name: 'כפר נחום', region: 'kineret', lat: 32.8805, lng: 35.5755,
      type: 'history', durationH: 1.5, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'אתר נוצרי מרכזי על שפת הכנרת — בית כנסת עתיק וכנסייה.', tip: 'לבוש צנוע; שילוב עם הר האושר הסמוך.' },
    { id: 'yardenit', name: 'ירדנית', region: 'kineret', lat: 32.7110, lng: 35.5710,
      type: 'history', durationH: 1, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'אתר הטבילה בנהר הירדן ביציאה מהכנרת — שקט ויפה.', tip: 'כניסה חינם; חנות מזכרות במקום.' },
    { id: 'hamatgader', name: 'חמת גדר', region: 'kineret', lat: 32.6852, lng: 35.6697,
      type: 'spa', durationH: 4, cost: 3, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'מעיינות חמים, פארק תנינים ועתיקות רומיות — יום שלם.', tip: 'הבריכות החמות מושלמות ליום חורפי קריר.' },
    { id: 'arbel', name: 'הר הארבל', region: 'kineret', lat: 32.8240, lng: 35.4970,
      type: 'view', durationH: 3, cost: 1, kids: 'teens', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'צוק תלול עם תצפית עוצרת נשימה אל הכנרת ומסלול מערות.', tip: 'מסלול הירידה תלול ומשתמש בשלבי ברזל; לא לפוחדים מגובה.' },
    { id: 'tiberias_promenade', name: 'טיילת טבריה', region: 'kineret', lat: 32.7900, lng: 35.5420,
      type: 'fun', durationH: 2, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'טיילת חוף מלאה מסעדות דגים, שייט ואווירה.', tip: 'הפלגת שקיעה על המים — חוויה רומנטית וזולה.' },
    { id: 'mount_beatitudes', name: 'הר האושר', region: 'kineret', lat: 32.8810, lng: 35.5560,
      type: 'history', durationH: 1, cost: 0, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'כנסייה וגנים יפים עם תצפית פנורמית על הכנרת.', tip: 'הגנים מטופחים; מקום שקט לצילומים.' },
    { id: 'maagan_michael_kfar', name: 'פארק ירדן (בית הלל/רפטינג)', region: 'kineret', lat: 33.0140, lng: 35.6160,
      type: 'water', durationH: 3, cost: 3, kids: '8+', seasons: [SP, SU],
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'קייקים ורפטינג בנהר הירדן ההררי — כיף רטוב לקבוצות.', tip: 'בחרו מסלול שקט/סוער לפי גיל; הזמינו מראש בקיץ.' },
    { id: 'belvoir', name: 'גן לאומי כוכב הירדן', region: 'kineret', lat: 32.5970, lng: 35.5050,
      type: 'history', durationH: 2, cost: 1, kids: '8+', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מבצר צלבני מהמשומרים בעולם, תצפית אל עמק הירדן.', tip: 'פחות עמוס; פסלי הסביבה מרשימים.' },
    { id: 'sachne', name: 'גן השלושה (סחנה)', region: 'kineret', lat: 32.5060, lng: 35.4530,
      type: 'water', durationH: 4, cost: 2, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'בריכות טבעיות פושרות (28°) בנוף קסום — גן עדן משפחתי.', tip: 'הגיעו מוקדם בחגים; מתמלא מאוד.' },
    { id: 'gan_garoo', name: 'גן גורו', region: 'kineret', lat: 32.5075, lng: 35.4470,
      type: 'fun', durationH: 2, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'פארק אוסטרלי עם קנגורו, קואלה וציפורים — ילדים אוהבים.', tip: 'משלבים עם גן השלושה הסמוך ליום מלא.' },
    { id: 'beit_shean', name: 'גן לאומי בית שאן', region: 'kineret', lat: 32.5040, lng: 35.5050,
      type: 'history', durationH: 2.5, cost: 1, kids: '8+', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'העיר הרומית-ביזנטית המרשימה בארץ — רחובות עמודים ותיאטרון.', tip: 'חם מאוד בקיץ; מבקרים בבוקר או בערב.' },

    // ===== חיפה והכרמל =====
    { id: 'bahai', name: 'הגנים הבהאים', region: 'haifa', lat: 32.8126, lng: 34.9828,
      type: 'view', durationH: 1.5, cost: 0, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מדרגות גנים מטופחות מהמרשימות בעולם, מורדות הכרמל.', tip: 'התצפית העליונה חינם; הסיור הפנימי דורש הרשמה.' },
    { id: 'wadi_nisnas', name: 'ואדי ניסנאס', region: 'haifa', lat: 32.8170, lng: 34.9930,
      type: 'market', durationH: 2, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'שכונה ערבית-נוצרית עם שוק, אוכל מעולה ואמנות רחוב.', tip: 'מאפיית הזעתר וחומוס אבו מארון — חובה.' },
    { id: 'carmel_beach', name: 'חוף הכרמל / דדו', region: 'haifa', lat: 32.8057, lng: 34.9552,
      type: 'beach', durationH: 3, cost: 0, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'חוף רחב עם טיילת, רחצה מוכרזת וספורט ימי.', tip: 'חניה נוחה; טיילת לאופניים והליכה.' },
    { id: 'stella_maris', name: 'מנזר סטלה מאריס', region: 'haifa', lat: 32.8261, lng: 34.9688,
      type: 'history', durationH: 1, cost: 0, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'מנזר כרמליטי על ראש הכרמל עם תצפית מרהיבה למפרץ.', tip: 'משלבים עם רכבל "כרמלית" וטיילת לואי.' },
    { id: 'caesarea', name: 'גן לאומי קיסריה', region: 'haifa', lat: 32.5014, lng: 34.8928,
      type: 'history', durationH: 3, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'נמל הורדוס, תיאטרון רומי וחוף — היסטוריה מול הים.', tip: 'מסעדות נמל יפות; ערב מבדל הוא קסם.' },
    { id: 'caesarea_aqueduct', name: 'אמת המים קיסריה', region: 'haifa', lat: 32.5254, lng: 34.9015,
      type: 'beach', durationH: 1.5, cost: 0, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'אמת מים רומית מרהיבה על חוף חולי — צילומים מושלמים.', tip: 'כניסה חינם; חוף לא מוכרז, היזהרו ברחצה.' },
    { id: 'ein_hod', name: 'עין הוד', region: 'haifa', lat: 32.7000, lng: 34.9850,
      type: 'museum', durationH: 2, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'כפר אמנים ציורי עם גלריות, סדנאות ונוף לים.', tip: 'מוזיאון יאנקו-דאדא ובתי קפה בוהמיים.' },
    { id: 'muhraka', name: 'מוחרקה (כרמל)', region: 'haifa', lat: 32.6790, lng: 35.0090,
      type: 'view', durationH: 1, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מנזר עם תצפית גג נדירה אל עמק יזרעאל והגלבוע.', tip: 'הגג פתוח לתשלום סמלי; נוף עצום.' },
    { id: 'haifa_zoo', name: 'הגן הזואולוגי חיפה', region: 'haifa', lat: 32.7920, lng: 34.9890,
      type: 'fun', durationH: 3, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'גן חיות ותיק בלב הכרמל עם מוזיאון טבע פעיל.', tip: 'מתאים מאוד למשפחות עם פעוטות.' },
    { id: 'german_colony_haifa', name: 'המושבה הגרמנית חיפה', region: 'haifa', lat: 32.8190, lng: 34.9880,
      type: 'fun', durationH: 2, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'שדרת בן-גוריון עם בתי טמפלרים, מסעדות וציר לגנים.', tip: 'הציר אל הגנים הבהאים מרהיב בערב מואר.' },
    { id: 'zichron', name: 'מדרחוב זכרון יעקב', region: 'haifa', lat: 32.5712, lng: 34.9530,
      type: 'fun', durationH: 2.5, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'מושבה ציורית, יקב כרמל ההיסטורי וגלריות לאורך הרחוב.', tip: 'סיור במרתפי יקב כרמל — הזמינו מראש.' },
    { id: 'atlit', name: 'מחנה המעפילים עתלית', region: 'haifa', lat: 32.7100, lng: 34.9430,
      type: 'museum', durationH: 2, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'אתר ההעפלה המשוחזר עם אוניית מעפילים — חוויה מרגשת.', tip: 'הסיור המודרך מוסיף המון; כדאי לתאם.' },

    // ===== תל אביב והמרכז =====
    { id: 'tlv_port', name: 'נמל תל אביב', region: 'telaviv', lat: 32.0987, lng: 34.7755,
      type: 'fun', durationH: 2.5, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'טיילת עץ על הים, שוק אוכל, מסעדות ובידור משפחתי.', tip: 'שוק האיכרים בשישי-שבת; מגרש משחקים לילדים.' },
    { id: 'carmel_market', name: 'שוק הכרמל', region: 'telaviv', lat: 32.0684, lng: 34.7686,
      type: 'market', durationH: 2, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: false, needsBooking: false, rainOk: true,
      desc: 'השוק התוסס של ת"א — פירות, תבלינים, סטריט-פוד ואווירה.', tip: 'סגור בשבת; משלבים עם שוק נחלת בנימין הסמוך.' },
    { id: 'old_jaffa', name: 'יפו העתיקה', region: 'telaviv', lat: 32.0538, lng: 34.7533,
      type: 'history', durationH: 2.5, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'סמטאות אבן, נמל עתיק, גלריות ושוק הפשפשים הסמוך.', tip: 'שוק הפשפשים תוסס ביום; חומוס אבו חסן בקרבת מקום.' },
    { id: 'tlv_museum', name: 'מוזיאון תל אביב לאמנות', region: 'telaviv', lat: 32.0776, lng: 34.7866,
      type: 'museum', durationH: 2, cost: 2, kids: 'teens', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'אוסף אמנות מודרנית ובניין אדריכלי מרשים.', tip: 'פתוח בשבת — מצוין ליום גשום.' },
    { id: 'tlv_beach', name: 'חופי תל אביב (גורדון/פרישמן)', region: 'telaviv', lat: 32.0850, lng: 34.7680,
      type: 'beach', durationH: 3, cost: 0, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'חופים מוכרזים עם מטקות, כיסאות נוח וטיילת אינסופית.', tip: 'חוף הילטון לכלבים; חוף הדתיים מופרד בקרבת מקום.' },
    { id: 'neve_tzedek', name: 'נווה צדק ותחנת ת"א', region: 'telaviv', lat: 32.0620, lng: 34.7640,
      type: 'fun', durationH: 2, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'השכונה היפה בעיר — סמטאות, בוטיקים ומתחם התחנה.', tip: 'בית סוזן דלל ושדרות רוטשילד במרחק הליכה.' },
    { id: 'sarona', name: 'שרונה מרקט', region: 'telaviv', lat: 32.0711, lng: 34.7871,
      type: 'market', durationH: 2, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'שוק אוכל מקורה גורמה בין בתי טמפלרים משוחזרים.', tip: 'פתוח בשבת; משלבים עם הקומפלקס הירוק שמסביב.' },
    { id: 'palmach_museum', name: 'מוזיאון הפלמ"ח', region: 'telaviv', lat: 32.1130, lng: 34.8050,
      type: 'museum', durationH: 1.5, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: false, needsBooking: true, rainOk: true,
      desc: 'מוזיאון חווייתי שמספר את סיפור הפלמ"ח דרך משפחה אחת.', tip: 'חובה להזמין מראש; סגור בשבת.' },
    { id: 'safari', name: 'ספארי רמת גן', region: 'telaviv', lat: 32.0510, lng: 34.8270,
      type: 'fun', durationH: 4, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'שמורת חיות ענקית עם מסע סאפרי ברכב וגן זואולוגי.', tip: 'הגיעו מוקדם; חם מאוד בקיץ אחה"צ.' },
    { id: 'eretz_israel_museum', name: 'מוזיאון ארץ ישראל (MUZA)', region: 'telaviv', lat: 32.1020, lng: 34.7900,
      type: 'museum', durationH: 2.5, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'קמפוס מוזיאוני עם זכוכית, מטבע, פלנטריום ותל קסילה.', tip: 'פתוח בשבת; פעילויות לילדים בסופ"ש.' },
    { id: 'rothschild', name: 'שדרות רוטשילד ובאוהאוס', region: 'telaviv', lat: 32.0640, lng: 34.7740,
      type: 'fun', durationH: 1.5, cost: 0, kids: 'teens', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'שדרה ירוקה עם אדריכלות באוהאוס מוכרת אונסק"ו.', tip: 'סיור אופניים/קורקינט נעים לאורך השדרה.' },
    { id: 'gordon_pool', name: 'בריכת גורדון', region: 'telaviv', lat: 32.0900, lng: 34.7700,
      type: 'water', durationH: 3, cost: 2, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'בריכת מי-ים מול החוף — קלאסיקה תל-אביבית מרעננת.', tip: 'משלבים עם הטיילת והנמל.' },

    // ===== מרכז ושפלה =====
    { id: 'mini_israel', name: 'מיני ישראל', region: 'merkaz', lat: 31.8423, lng: 34.9690,
      type: 'fun', durationH: 3, cost: 2, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מאות אתרי ישראל בדגמים זעירים מדויקים — כיף לכל הגילים.', tip: 'חם בקיץ; בקרו בבוקר או בערב הקיץ.' },
    { id: 'beit_guvrin', name: 'גן לאומי בית גוברין-מרשה', region: 'merkaz', lat: 31.5953, lng: 34.9025,
      type: 'history', durationH: 3, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מערות פעמון, עמודות ומחילות — אתר אונסק"ו תת-קרקעי.', tip: 'המערות קרירות גם בקיץ; פנס שימושי.' },
    { id: 'latrun_armor', name: 'יד לשריון לטרון', region: 'merkaz', lat: 31.8390, lng: 34.9830,
      type: 'museum', durationH: 2, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'אוסף טנקים ענק ואנדרטת חיל השריון עם תצפית.', tip: 'ילדים מתלהבים; הרבה צל מוגבל — כובע ומים.' },
    { id: 'caesarea_merkaz', name: 'פארק קנדה (איילון)', region: 'merkaz', lat: 31.8350, lng: 34.9780,
      type: 'nature', durationH: 2, cost: 0, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'יער נטוע עם שבילי הליכה, אופניים ופיקניק במרכז.', tip: 'חינמי; פריחת כלניות ורקפות בחורף.' },
    { id: 'soreq_cave', name: 'מערת הנטיפים (שורק)', region: 'merkaz', lat: 31.7560, lng: 35.0250,
      type: 'nature', durationH: 1.5, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'מערת נטיפים מרהיבה ביופייה — פלא טבע נגיש.', tip: 'מקום מצוין ליום גשום; כניסה בשעות קבועות.' },
    { id: 'rishon_park', name: 'פארק רעננה / פארק הסובב ראשל"צ', region: 'merkaz', lat: 31.9730, lng: 34.7900,
      type: 'fun', durationH: 2, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'פארקים עירוניים גדולים עם אגם, מגרשים ושבילי אופניים.', tip: 'מצוין למשפחות עם ילדים קטנים, חינמי.' },
    { id: 'palmachim_beach', name: 'חוף פלמחים', region: 'merkaz', lat: 31.9290, lng: 34.6980,
      type: 'beach', durationH: 3, cost: 1, kids: 'all', seasons: [SP, SU, AU],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'חוף פראי ויפה עם שמורת טבע וצב ים — רגוע ולא צפוף.', tip: 'רחצה מוכרזת בקיץ בלבד; שמרו על הצבים.' },
    { id: 'ramla_pool', name: 'בריכת הקשתות רמלה', region: 'merkaz', lat: 31.9280, lng: 34.8650,
      type: 'history', durationH: 1, cost: 1, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'מאגר מים תת-קרקעי קדום שמשייטים בו בסירות — ייחודי.', tip: 'משלבים עם שוק רמלה ומגדל הלבן.' },
    { id: 'neot_kedumim', name: 'נאות קדומים', region: 'merkaz', lat: 31.8950, lng: 34.9450,
      type: 'nature', durationH: 2.5, cost: 2, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: false, needsBooking: true, rainOk: false,
      desc: 'גן נופי המקרא עם צמחים, חקלאות עתיקה ופעילויות.', tip: 'סגור בשבת; פעילויות מודרכות מומלצות.' },
    { id: 'modiin_park', name: 'פארק ענבה / חורבת מודיעין', region: 'merkaz', lat: 31.9050, lng: 35.0070,
      type: 'nature', durationH: 2, cost: 0, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'פארק מטיילים עם אגם, שבילי אופניים ואתרים ארכיאולוגיים.', tip: 'אגם המים יפה; חינמי ונגיש.' },
    { id: 'yarkon_park', name: 'פארק הירקון', region: 'merkaz', lat: 32.1010, lng: 34.8100,
      type: 'fun', durationH: 3, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'הריאה הירוקה של גוש דן — סירות, מדשאות ורכיבה.', tip: 'השכרת סירות פדל באגם; פיקניק קלאסי.' },
    { id: 'rehovot_weizmann', name: 'גן המדע ויצמן', region: 'merkaz', lat: 31.9070, lng: 34.8090,
      type: 'museum', durationH: 2.5, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: false, needsBooking: false, rainOk: true,
      desc: 'גן מדע אינטראקטיבי ענק — מתקנים שמלמדים פיזיקה בכיף.', tip: 'סגור בשבת; יום שלם של למידה חווייתית.' },

    // ===== ירושלים =====
    { id: 'old_city', name: 'העיר העתיקה והכותל', region: 'jerusalem', lat: 31.7767, lng: 35.2345,
      type: 'history', durationH: 4, cost: 0, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'ארבעת הרבעים, הכותל, השווקים והקדושה של אלפי שנים.', tip: 'לבוש צנוע; בוקר מוקדם פחות עמוס.' },
    { id: 'tower_david', name: 'מגדל דוד', region: 'jerusalem', lat: 31.7760, lng: 35.2283,
      type: 'museum', durationH: 2, cost: 2, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: true, rainOk: true,
      desc: 'מוזיאון תולדות ירושלים במצודה עם תצפית גג מרהיבה.', tip: 'מופע הלילה (לילה לבן) — חוויה; הזמינו מראש.' },
    { id: 'mahane_yehuda', name: 'שוק מחנה יהודה', region: 'jerusalem', lat: 31.7848, lng: 35.2126,
      type: 'market', durationH: 2.5, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: false, needsBooking: false, rainOk: true,
      desc: 'השוק התוסס של ירושלים — אוכל, ברים ואווירה בלתי-נשכחת.', tip: 'בערב הופך למתחם בילוי; סגור בשבת.' },
    { id: 'israel_museum', name: 'מוזיאון ישראל', region: 'jerusalem', lat: 31.7719, lng: 35.2034,
      type: 'museum', durationH: 3, cost: 2, kids: '8+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'היכל הספר, מגילות מדבר יהודה ומודל ירושלים העתיקה.', tip: 'פתוח בשבת; ענק — בחרו אגפים מראש.' },
    { id: 'yad_vashem', name: 'יד ושם', region: 'jerusalem', lat: 31.7742, lng: 35.1773,
      type: 'museum', durationH: 3, cost: 0, kids: 'teens', seasons: ALL,
      shabbatOpen: false, needsBooking: false, rainOk: true,
      desc: 'רשות הזיכרון לשואה — חוויה מטלטלת ומחנכת.', tip: 'כניסה חינם; לא מתאים לילדים קטנים; סגור בשבת.' },
    { id: 'city_of_david', name: 'עיר דוד', region: 'jerusalem', lat: 31.7740, lng: 35.2360,
      type: 'history', durationH: 3, cost: 2, kids: '8+', seasons: ALL,
      shabbatOpen: false, needsBooking: true, rainOk: false,
      desc: 'אתר ירושלים הקדומה ומנהרת המים של חזקיהו.', tip: 'נעלי מים למנהרה הרטובה; הזמינו מראש; סגור בשבת.' },
    { id: 'mount_olives', name: 'הר הזיתים — תצפית', region: 'jerusalem', lat: 31.7780, lng: 35.2450,
      type: 'view', durationH: 1, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'התצפית הקלאסית על העיר העתיקה והר הבית.', tip: 'הזריחה והשקיעה מרהיבות; חניה מוגבלת.' },
    { id: 'machne_train', name: 'תחנת הרכבת הראשונה', region: 'jerusalem', lat: 31.7660, lng: 35.2200,
      type: 'fun', durationH: 2, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מתחם בילוי במבנה רכבת היסטורי — מסעדות, שוק ואירועים.', tip: 'פתוח בשבת; אופניים על מסילת הרכבת לתל אביב.' },
    { id: 'bloomfield_science', name: 'מוזיאון המדע בלומפילד', region: 'jerusalem', lat: 31.7770, lng: 35.1980,
      type: 'museum', durationH: 2.5, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: false, needsBooking: false, rainOk: true,
      desc: 'מוזיאון מדע אינטראקטיבי — מתקנים מצוינים לילדים.', tip: 'סגור בשבת; יום גשום מושלם.' },
    { id: 'ein_kerem', name: 'עין כרם', region: 'jerusalem', lat: 31.7660, lng: 35.1620,
      type: 'fun', durationH: 2.5, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'כפר ציורי בהרי ירושלים עם מעיין, כנסיות ובתי קפה.', tip: 'אווירה כפרית מקסימה; חנו למעלה ורדו ברגל.' },
    { id: 'biblical_zoo', name: 'גן החיות התנ"כי', region: 'jerusalem', lat: 31.7450, lng: 35.1740,
      type: 'fun', durationH: 4, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מהיפים בעולם — חיות התנ"ך, אקווריום ורכבת פנימית.', tip: 'יום שלם; פתוח בשבת. שילוב עם האקווריום הסמוך.' },
    { id: 'knesset', name: 'מנורת הכנסת והגנים', region: 'jerusalem', lat: 31.7767, lng: 35.2057,
      type: 'view', durationH: 1, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מנורת הזהב מול הכנסת וגן הוורדים הגדול הסמוך.', tip: 'גן הוורדים מטופח ונעים לפיקניק.' },

    // ===== ים המלח =====
    { id: 'masada', name: 'מצדה', region: 'deadsea', lat: 31.3156, lng: 35.3539,
      type: 'history', durationH: 3, cost: 2, kids: '8+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'המצודה ההרודיאנית על צוק מול ים המלח — סמל ונוף.', tip: 'זריחה משביל הנחש בלתי-נשכחת; בקיץ עלו ברכבל בלבד.' },
    { id: 'ein_gedi', name: 'שמורת עין גדי', region: 'deadsea', lat: 31.4447, lng: 35.3732,
      type: 'nature', durationH: 3, cost: 2, kids: '4+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'נחלי דוד וערוגות, מפלים ויעלים בלב המדבר.', tip: 'נעלי מים; מסלול נחל דוד קצר ומתאים למשפחות.' },
    { id: 'ein_bokek', name: 'חוף עין בוקק', region: 'deadsea', lat: 31.2014, lng: 35.3639,
      type: 'beach', durationH: 3, cost: 0, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'חוף המלונות המוכרז — ציפה במים, בוץ מרפא ושמש.', tip: 'אל תגלחו לפני; שטיפת עיניים מיד אם נכנס מלח.' },
    { id: 'deadsea_spa', name: 'ספא ים המלח (עין בוקק)', region: 'deadsea', lat: 31.1990, lng: 35.3620,
      type: 'spa', durationH: 3, cost: 3, kids: 'no', seasons: ALL,
      shabbatOpen: true, needsBooking: true, rainOk: true,
      desc: 'בריכות גופרית חמות, עיסויים וטיפולי בוץ במלונות.', tip: 'יום ספא זוגי מושלם; הזמינו מראש.' },
    { id: 'nahal_arugot', name: 'נחל ערוגות', region: 'deadsea', lat: 31.4380, lng: 35.3850,
      type: 'water', durationH: 3, cost: 2, kids: '8+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'הנחל השני בעין גדי — בריכה נסתרת ומסלול ירוק ויפה.', tip: 'פחות עמוס מנחל דוד; הזהרו בחום קיצי.' },
    { id: 'metzoke_dragot', name: 'מצוקי דרגות', region: 'deadsea', lat: 31.5780, lng: 35.4050,
      type: 'fun', durationH: 3, cost: 3, kids: 'teens', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'אבסיילינג, רפלינג וטיולי שטח מעל ים המלח.', tip: 'הזמינו מדריך; חוויית אדרנלין מול נוף ענק.' },
    { id: 'qumran', name: 'גן לאומי קומראן', region: 'deadsea', lat: 31.7410, lng: 35.4590,
      type: 'history', durationH: 1.5, cost: 1, kids: '8+', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'אתר מגילות מדבר יהודה — כת האיסיים והמערות.', tip: 'סרט הסבר קצר; חם מאוד בצהריים.' },
    { id: 'ein_gedi_botanical', name: 'גן בוטני עין גדי', region: 'deadsea', lat: 31.4620, lng: 35.3880,
      type: 'nature', durationH: 1.5, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'הקיבוץ הירוק היחיד עם גן בוטני נדיר בלב המדבר.', tip: 'נווה מדבר אמיתי; מסלול קל ונעים.' },
    { id: 'wadi_bokek', name: 'נחל בוקק', region: 'deadsea', lat: 31.2050, lng: 35.3500,
      type: 'water', durationH: 2, cost: 0, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מסלול נחל קצר וזורם מאחורי מלונות עין בוקק — חינמי.', tip: 'נגיש מאוד; מתאים אחרי הים.' },
    { id: 'mineral_beach', name: 'חוף ביוקל / חופי הצפון', region: 'deadsea', lat: 31.7000, lng: 35.4500,
      type: 'beach', durationH: 2.5, cost: 1, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'חופי רחצה בצפון ים המלח עם מקלחות ובוץ.', tip: 'ודאו שהחוף פעיל ומוכרז לפני שמגיעים.' },
    { id: 'lot_cave', name: 'מנזר/מצפור ראש צוקים', region: 'deadsea', lat: 31.0900, lng: 35.3800,
      type: 'view', durationH: 1, cost: 0, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'תצפית פתוחה דרומה אל ים המלח ומפעלי המלח.', tip: 'שקיעה אדומה מרהיבה; עצירה קצרה בדרך.' },
    { id: 'arad_canyon', name: 'תצפית כביש 31 (כיכר ערד)', region: 'deadsea', lat: 31.2580, lng: 35.2120,
      type: 'view', durationH: 0.5, cost: 0, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'תצפית דרמטית בירידה לים המלח דרך מדבר יהודה.', tip: 'עצירה לצילום; משלבים עם מצדה.' },

    // ===== מצפה רמון והנגב =====
    { id: 'makhtesh_ramon', name: 'מצפה המכתש רמון', region: 'ramon', lat: 30.6097, lng: 34.8030,
      type: 'view', durationH: 1.5, cost: 1, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'התצפית אל המכתש הגדול בעולם ומרכז המבקרים.', tip: 'מרכז המבקרים "ביו-רמון" מסביר את הגיאולוגיה.' },
    { id: 'ramon_carpentry', name: 'מנסרת הצבעים (מכתש)', region: 'ramon', lat: 30.6000, lng: 34.7600,
      type: 'nature', durationH: 1, cost: 0, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'תופעת חול צבעוני וסלעי פריזמה בתחתית המכתש.', tip: 'נסיעת 4x4 או הליכה קצרה; קסם גיאולוגי.' },
    { id: 'ramon_stars', name: 'תצפית כוכבים מצפה רמון', region: 'ramon', lat: 30.5950, lng: 34.8050,
      type: 'view', durationH: 2, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'אחד השמיים הכהים בעולם — תצפית כוכבים עם טלסקופ.', tip: 'הזמינו סיור אסטרונומי מודרך; הביאו בגד חם.' },
    { id: 'alpaca_farm', name: 'חוות האלפקות', region: 'ramon', lat: 30.5990, lng: 34.7850,
      type: 'fun', durationH: 2, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'אלפקות, למות וסוסים בלב המדבר — אהוב על ילדים.', tip: 'אפשר לינה בחווה; האכלת בעלי החיים.' },
    { id: 'ramon_abseiling', name: 'אבסיילינג בעין סהרונים', region: 'ramon', lat: 30.5200, lng: 34.7800,
      type: 'fun', durationH: 3, cost: 3, kids: 'teens', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'גלישת מצוקים ורפלינג בלב המכתש — אדרנלין מדברי.', tip: 'חובה מדריך מוסמך; הזמינו מראש.' },
    { id: 'ein_avdat', name: 'שמורת עין עבדת', region: 'ramon', lat: 30.8290, lng: 34.7700,
      type: 'water', durationH: 2.5, cost: 2, kids: '8+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'קניון מדברי עם מעיינות, מפל ויעלים — פנינה אמיתית.', tip: 'מסלול חד-כיווני; ארגנו רכב בסוף.' },
    { id: 'avdat', name: 'גן לאומי עבדת', region: 'ramon', lat: 30.7930, lng: 34.7730,
      type: 'history', durationH: 2, cost: 1, kids: '8+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'עיר נבטית מרשימה על דרך הבשמים — אתר אונסק"ו.', tip: 'משלבים עם עין עבדת הסמוך; חם בצהריים.' },
    { id: 'sde_boker', name: 'שדה בוקר וקבר בן-גוריון', region: 'ramon', lat: 30.8700, lng: 34.7950,
      type: 'view', durationH: 1, cost: 0, kids: 'all', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'תצפית מרהיבה אל נחל צין מעל קבר בן-גוריון ופולה.', tip: 'חינמי; שילוב מצוין עם עין עבדת.' },
    { id: 'ramon_bike', name: 'מסלולי אופניים מצפה רמון', region: 'ramon', lat: 30.6080, lng: 34.8000,
      type: 'fun', durationH: 3, cost: 1, kids: 'teens', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מסלולי שטח מסומנים סביב ובתוך המכתש — לרוכבים.', tip: 'מים בשפע; אין צל במכתש.' },
    { id: 'ramon_visitor', name: 'מרכז מבקרים רמון (מורשת בן-גוריון)', region: 'ramon', lat: 30.6090, lng: 34.8025,
      type: 'museum', durationH: 1, cost: 1, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'תצוגה על המכתש, הגיאולוגיה ואסטרונאוט אילן רמון.', tip: 'מקלט מהחום; מתאים ליום סוער.' },
    { id: 'spice_route', name: 'חאן בארות (דרך הבשמים)', region: 'ramon', lat: 30.6600, lng: 34.8500,
      type: 'history', durationH: 1.5, cost: 1, kids: '8+', seasons: [SP, AU, WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'תחנת שיירות נבטית ובאר מים על דרך הבשמים העתיקה.', tip: 'אתר שקט ומאוד אותנטי.' },
    { id: 'shaharut', name: 'שחרות וחוות גמלים', region: 'ramon', lat: 29.9500, lng: 35.0250,
      type: 'fun', durationH: 3, cost: 3, kids: '8+', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'יישוב מדברי מבודד עם טיולי גמלים ושקיעות פתוחות.', tip: 'מרחק נסיעה; שלבו לינה במדבר.' },

    // ===== אילת והערבה =====
    { id: 'coral_beach', name: 'שמורת חוף האלמוגים', region: 'eilat', lat: 29.5098, lng: 34.9225,
      type: 'beach', durationH: 4, cost: 2, kids: '4+', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'השונית היפה בארץ — שנירקול ישירות מהחוף.', tip: 'השכרת ציוד במקום; אל תיגעו באלמוגים.' },
    { id: 'underwater', name: 'מצפה תת-ימי', region: 'eilat', lat: 29.5042, lng: 34.9172,
      type: 'fun', durationH: 3, cost: 3, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'אקווריום ענק, מגדל צפייה תת-ימי וכרישים.', tip: 'יום שלם למשפחה; פתוח בשבת.' },
    { id: 'dolphin_reef', name: 'חוף הדולפינים', region: 'eilat', lat: 29.5290, lng: 34.9180,
      type: 'fun', durationH: 3, cost: 3, kids: '4+', seasons: ALL,
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'שחייה וצלילה עם דולפינים חופשיים במפרץ.', tip: 'הזמינו מראש לצלילה; הכניסה לחוף עצמה זולה יותר.' },
    { id: 'timna', name: 'פארק תמנע', region: 'eilat', lat: 29.7728, lng: 34.9866,
      type: 'nature', durationH: 4, cost: 2, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'עמודי שלמה, אגם, סלעי פטריה ומכרות נחושת עתיקים.', tip: 'נוסעים ברכב בין האתרים; אגם וכיף לילדים.' },
    { id: 'red_canyon', name: 'הקניון האדום', region: 'eilat', lat: 29.6650, lng: 34.8830,
      type: 'nature', durationH: 2.5, cost: 0, kids: '8+', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'קניון צר ואדום עם שלבי ברזל — טיול מדברי קסום וחינמי.', tip: 'לא בקיץ ולא בגשם (סכנת שיטפון); בוקר עדיף.' },
    { id: 'eilat_promenade', name: 'טיילת אילת והלגונה', region: 'eilat', lat: 29.5500, lng: 34.9550,
      type: 'fun', durationH: 2, cost: 0, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'טיילת תוססת עם מסעדות, אטרקציות מים ושייט.', tip: 'מושלם לערב; פעילויות ים בשפע.' },
    { id: 'ice_park', name: 'פארק הקרח / קניון אייס', region: 'eilat', lat: 29.5560, lng: 34.9520,
      type: 'fun', durationH: 2, cost: 2, kids: 'all', seasons: SU ? ALL : ALL,
      shabbatOpen: true, needsBooking: false, rainOk: true,
      desc: 'אטרקציה ממוזגת לימי הקיץ הלוהטים — קרח ופעילות.', tip: 'מקלט אידיאלי משרב הקיץ.' },
    { id: 'eilat_mountains', name: 'הרי אילת (הר יואש/צפחות)', region: 'eilat', lat: 29.6000, lng: 34.9300,
      type: 'view', durationH: 3, cost: 0, kids: 'teens', seasons: [WI],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'מסלולי תצפית מרהיבים על מפרץ אילת וארבע מדינות.', tip: 'חורף בלבד; הביאו הרבה מים.' },
    { id: 'birdwatching', name: 'פארק ציפורים אילת (IBRCE)', region: 'eilat', lat: 29.5560, lng: 34.9600,
      type: 'nature', durationH: 2, cost: 1, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'תחנת טיבוע במסלול הנדידה הגדול — מאות מיני ציפורים.', tip: 'אביב וסתיו = שיא הנדידה; הביאו משקפת.' },
    { id: 'kibbutz_lotan', name: 'קיבוץ לוטן / חי-בר יטבתה', region: 'eilat', lat: 29.8930, lng: 35.0350,
      type: 'nature', durationH: 2.5, cost: 2, kids: 'all', seasons: [AU, WI, SP],
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'שמורת חי-בר עם חיות מדבר מקראיות במסע ספארי.', tip: 'נוסעים ברכב פרטי בין המכלאות; בוקר פעיל יותר.' },
    { id: 'eilat_diving', name: 'צלילה במפרץ אילת', region: 'eilat', lat: 29.5050, lng: 34.9200,
      type: 'water', durationH: 3, cost: 3, kids: 'teens', seasons: ALL,
      shabbatOpen: true, needsBooking: true, rainOk: false,
      desc: 'אתרי צלילה מהטובים בעולם — שונית, אוניית סאטיל וטמלה.', tip: 'קורס צלילת היכרות זמין; הזמינו מראש.' },
    { id: 'eilat_glass_boat', name: 'שייט תחתית-זכוכית', region: 'eilat', lat: 29.5400, lng: 34.9500,
      type: 'fun', durationH: 1.5, cost: 2, kids: 'all', seasons: ALL,
      shabbatOpen: true, needsBooking: false, rainOk: false,
      desc: 'הפלגה מעל השונית עם תחתית שקופה — בלי להירטב.', tip: 'מצוין למשפחות שלא צוללות.' }
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // 3) RESTAURANTS — 4-5 לכל אזור (מוסדות ותיקים/דגל). price 1=זול 2=בינוני 3=יקר
  // ──────────────────────────────────────────────────────────────────────────
  var restaurants = [
    // גליל
    { id: 'r_dag_aviv', name: 'דאג על הדן', region: 'galil', lat: 33.2300, lng: 35.6300, style: 'דגי נחל וטרוטה', price: 2, kosher: true, desc: 'מסעדת דגים ותיקה על מי הדן — אווירה כפרית.' },
    { id: 'r_dardara', name: 'מסעדת דרדרה', region: 'galil', lat: 33.2280, lng: 35.6280, style: 'דגים וגריל', price: 2, kosher: true, desc: 'קלאסיקה צפונית על המים ליד שדה נחמיה.' },
    { id: 'r_roshpina_grill', name: 'מסעדות ראש פינה (רחוב האומנים)', region: 'galil', lat: 32.9682, lng: 35.5438, style: 'בשרים ושף', price: 3, kosher: false, desc: 'מקבץ מסעדות שף לערב רומנטי במושבה.' },
    { id: 'r_metula', name: 'המסעדה בחאן מטולה', region: 'galil', lat: 33.2790, lng: 35.5790, style: 'ביתי וגריל', price: 2, kosher: true, desc: 'אוכל ביתי בחאן ההיסטורי של מטולה.' },
    { id: 'r_druze_galil', name: 'אירוח דרוזי (כפרי הצפון)', region: 'galil', lat: 33.0100, lng: 35.4500, style: 'מטבח דרוזי', price: 1, kosher: false, desc: 'פיתות סאג\', לאבנה ומאכלים ביתיים אותנטיים.' },

    // גולן
    { name: 'r_meatos', id: 'r_meatos', region: 'golan', lat: 32.9900, lng: 35.6900, style: 'בשרים', price: 2, kosher: true, desc: 'גריל בשרים מקומי בקצרין — מנות נדיבות.' },
    { id: 'r_bencion', name: 'בנדיקט / בקתת הסטייק קצרין', region: 'golan', lat: 32.9920, lng: 35.6910, style: 'סטייקים', price: 2, kosher: true, desc: 'בשר גולני טרי ואווירה כפרית.' },
    { id: 'r_anan', name: 'קפה אנן (הר בנטל)', region: 'golan', lat: 33.1289, lng: 35.7856, style: 'בית קפה ותצפית', price: 2, kosher: true, desc: 'בית הקפה הגבוה בארץ עם נוף לעמק הבכא.' },
    { id: 'r_witch', name: 'המכשפה / יקב בזלת', region: 'golan', lat: 33.0000, lng: 35.7000, style: 'ביסטרו ויין', price: 3, kosher: false, desc: 'אוכל מקומי לצד יקבי הגולן.' },
    { id: 'r_ein_zivan', name: 'בית קפה עין זיוון (שוקולד)', region: 'golan', lat: 33.1450, lng: 35.7700, style: 'קינוחים ושוקולד', price: 2, kosher: true, desc: 'מפעל שוקולד וקפה בקיבוץ — חובה לקינוח.' },

    // כנרת
    { id: 'r_decks', name: 'דקס טבריה', region: 'kineret', lat: 32.7950, lng: 35.5420, style: 'גריל על האש', price: 3, kosher: true, desc: 'מוסד טבריאני ותיק על מזח מעל הכנרת.' },
    { id: 'r_lido', name: 'מסעדת הדגים לידו', region: 'kineret', lat: 32.7920, lng: 35.5440, style: 'דגי כנרת', price: 2, kosher: true, desc: 'מושט (אמנון) טרי על שפת הים — קלאסיקה.' },
    { id: 'r_ein_gev', name: 'מסעדת הדגים עין גב', region: 'kineret', lat: 32.7811, lng: 35.6389, style: 'דגי כנרת', price: 2, kosher: true, desc: 'מסעדת דגים ותיקה בקיבוץ על חוף מזרחי.' },
    { id: 'r_pagoda', name: 'הפגודה טבריה', region: 'kineret', lat: 32.7960, lng: 35.5410, style: 'אסייתי', price: 2, kosher: false, desc: 'מסעדה אסייתית ותיקה ויפה מול הכנרת.' },
    { id: 'r_tabgha', name: 'מאפיית הכפר (כנרת)', region: 'kineret', lat: 32.7000, lng: 35.5800, style: 'מאפים וקפה', price: 1, kosher: true, desc: 'עצירת בוקר נעימה למאפים ביתיים.' },

    // חיפה
    { id: 'r_abu_maron', name: 'חומוס אבו מארון', region: 'haifa', lat: 32.8160, lng: 34.9930, style: 'חומוס', price: 1, kosher: false, desc: 'מוסד חומוס אגדי בוואדי ניסנאס.' },
    { id: 'r_fattoush', name: 'פתוש', region: 'haifa', lat: 32.8170, lng: 34.9920, style: 'מטבח ערבי-ים תיכוני', price: 2, kosher: false, desc: 'מסעדה-גלריה ותיקה ויפהפייה במושבה הגרמנית.' },
    { id: 'r_maayan', name: 'מעין הבירה', region: 'haifa', lat: 32.8190, lng: 35.0000, style: 'מטבח רומני-יהודי', price: 2, kosher: true, desc: 'קישקע, פרקש וגולש — מוסד חיפאי ותיק בעיר התחתית.' },
    { id: 'r_uri_buri', name: 'אורי בורי (עכו)', region: 'haifa', lat: 32.9210, lng: 35.0700, style: 'דגים ופירות ים', price: 3, kosher: false, desc: 'מהמסעדות הטובות בארץ, בעיר העתיקה של עכו.' },
    { id: 'r_helena', name: 'הלנה קיסריה', region: 'haifa', lat: 32.5014, lng: 34.8928, style: 'ים תיכוני', price: 3, kosher: false, desc: 'מסעדת דגל בנמל קיסריה מול הים.' },

    // תל אביב
    { id: 'r_abu_hasan', name: 'חומוס אבו חסן (יפו)', region: 'telaviv', lat: 32.0530, lng: 34.7560, style: 'חומוס', price: 1, kosher: false, desc: 'החומוס המפורסם בארץ — תור משתלם.' },
    { id: 'r_dr_shakshuka', name: 'ד"ר שקשוקה (יפו)', region: 'telaviv', lat: 32.0540, lng: 34.7560, style: 'טריפוליטאי', price: 2, kosher: true, desc: 'שקשוקה וחמין טריפוליטאי במחבת ענק — מוסד.' },
    { id: 'r_miznon', name: 'מזנון (איבן גבירול)', region: 'telaviv', lat: 32.0800, lng: 34.7830, style: 'פיתות שף', price: 2, kosher: false, desc: 'פיתות גורמה של אייל שני — איקון תל-אביבי.' },
    { id: 'r_haatzma', name: 'שוק הכרמל — דוכני אוכל', region: 'telaviv', lat: 32.0684, lng: 34.7686, style: 'סטריט פוד', price: 1, kosher: false, desc: 'בורקס, מיצים וסטריט-פוד לאורך השוק.' },
    { id: 'r_port_seafood', name: 'מסעדות נמל תל אביב', region: 'telaviv', lat: 32.0987, lng: 34.7755, style: 'דגים וברנצ\'', price: 3, kosher: false, desc: 'שורת מסעדות וברנצ\' על הים בנמל.' },

    // מרכז
    { id: 'r_latrun_burger', name: 'מסעדות לטרון / שער הגיא', region: 'merkaz', lat: 31.8390, lng: 34.9830, style: 'גריל ומשפחתי', price: 2, kosher: true, desc: 'עצירת אוכל נוחה בדרך לירושלים.' },
    { id: 'r_falafel_ramla', name: 'שוק רמלה — חומוס ופלאפל', region: 'merkaz', lat: 31.9280, lng: 34.8650, style: 'אוכל רחוב', price: 1, kosher: false, desc: 'מאכלי שוק אותנטיים בעיר מעורבת.' },
    { id: 'r_rishon_meat', name: 'בשרי ראשון לציון (מתחם)', region: 'merkaz', lat: 31.9640, lng: 34.8040, style: 'גריל ובשרים', price: 2, kosher: true, desc: 'מקבץ מסעדות בשר משפחתיות.' },
    { id: 'r_zikhron_tishbi', name: 'יקב תשבי זכרון יעקב', region: 'merkaz', lat: 32.5712, lng: 34.9530, style: 'ביסטרו ויין', price: 3, kosher: true, desc: 'ביסטרו לצד יין במושבה — מוסד ותיק.' },

    // ירושלים
    { id: 'r_machneyuda', name: 'מחניודה', region: 'jerusalem', lat: 31.7848, lng: 35.2126, style: 'שף ישראלי', price: 3, kosher: false, desc: 'מהמסעדות המפורסמות בישראל, ליד השוק.' },
    { id: 'r_azura', name: 'אזורה (שוק)', region: 'jerusalem', lat: 31.7850, lng: 35.2120, style: 'ספרדי-עירקי', price: 2, kosher: true, desc: 'תבשילי סיר על פתיליות — מוסד ירושלמי אגדי.' },
    { id: 'r_abu_shukri', name: 'אבו שוקרי (עיר עתיקה)', region: 'jerusalem', lat: 31.7790, lng: 35.2320, style: 'חומוס', price: 1, kosher: false, desc: 'חומוס מיתולוגי בלב הרובע המוסלמי.' },
    { id: 'r_marvad', name: 'מרוקאי מרבד הקסמים', region: 'jerusalem', lat: 31.7860, lng: 35.2130, style: 'מרוקאי', price: 2, kosher: true, desc: 'אוכל מרוקאי ביתי ותיק ליד השוק.' },
    { id: 'r_eucalyptus', name: 'אקליפטוס', region: 'jerusalem', lat: 31.7760, lng: 35.2280, style: 'מטבח תנ"כי', price: 3, kosher: true, desc: 'שף משה בסון — מנות בהשראת צמחי המקרא.' },

    // ים המלח
    { id: 'r_taj_mahal', name: 'טאג\' מהאל ערד', region: 'deadsea', lat: 31.2580, lng: 35.2120, style: 'הודי', price: 2, kosher: false, desc: 'מסעדה הודית ותיקה בדרך לים המלח.' },
    { id: 'r_pundak70', name: 'פונדק 70 / מזנוני מצדה', region: 'deadsea', lat: 31.3156, lng: 35.3539, style: 'ביתי ומזנון', price: 2, kosher: true, desc: 'עצירת אוכל נוחה באזור מצדה.' },
    { id: 'r_ein_bokek_hotels', name: 'מסעדות מלונות עין בוקק', region: 'deadsea', lat: 31.2014, lng: 35.3639, style: 'בופה ובינלאומי', price: 3, kosher: true, desc: 'מגוון מסעדות במתחם המלונות.' },
    { id: 'r_kfar_hanokdim', name: 'כפר הנוקדים (אוהל בדואי)', region: 'deadsea', lat: 31.3000, lng: 35.2300, style: 'אירוח בדואי', price: 2, kosher: false, desc: 'ארוחה בדואית באוהל בלב המדבר.' },

    // מצפה רמון
    { id: 'r_hahavit', name: 'החבית מצפה רמון', region: 'ramon', lat: 30.6090, lng: 34.8000, style: 'פאב ובשרים', price: 2, kosher: false, desc: 'פאב מקומי אהוב במצפה רמון.' },
    { id: 'r_lasha', name: 'לאשה / ביסטרו מדברי', region: 'ramon', lat: 30.6080, lng: 34.8010, style: 'ביסטרו מקומי', price: 2, kosher: false, desc: 'אוכל מקומי טרי במתחם הספיר.' },
    { id: 'r_hanmidbar', name: 'חאן בנגב (שדה בוקר)', region: 'ramon', lat: 30.8700, lng: 34.7950, style: 'ביתי ומדברי', price: 1, kosher: true, desc: 'אוכל ביתי באזור מדרשת בן-גוריון.' },
    { id: 'r_alpaca_cafe', name: 'בית קפה חוות האלפקות', region: 'ramon', lat: 30.5990, lng: 34.7850, style: 'קפה וכריכים', price: 1, kosher: false, desc: 'עצירה נעימה בין בעלי החיים.' },

    // אילת
    { id: 'r_ginger', name: 'ג\'ינג\'ר אסיה אילת', region: 'eilat', lat: 29.5500, lng: 34.9520, style: 'אסייתי', price: 2, kosher: false, desc: 'מסעדה אסייתית ותיקה ואהובה בעיר.' },
    { id: 'r_pago', name: 'פאגו פאגו', region: 'eilat', lat: 29.5510, lng: 34.9540, style: 'דגים ויוקרה', price: 3, kosher: false, desc: 'מסעדת דגל על המים בלגונה.' },
    { id: 'r_lalo', name: 'לאלו בשר (אילת)', region: 'eilat', lat: 29.5560, lng: 34.9510, style: 'בשרים', price: 2, kosher: true, desc: 'גריל בשרים כשר ותיק בטיילת.' },
    { id: 'r_dr_lek', name: 'ד"ר לק גלידה', region: 'eilat', lat: 29.5550, lng: 34.9530, style: 'גלידה וקינוחים', price: 1, kosher: true, desc: 'גלידריה אהובה לסיום ערב חם.' }
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // 4) LODGING — 4+ לכל אזור על פני הרמות. priceNight=[min,max] ₪ ללילה.
  //    free=חניוני רט"ג/קמפינג · budget≤500 · mid 500-1000 · premium 1000+
  // ──────────────────────────────────────────────────────────────────────────
  var lodging = [
    // גליל
    { id: 'l_horshat_tal', name: 'חניון לילה חורשת טל', region: 'galil', lat: 33.2200, lng: 35.6280, level: 'free', priceNight: [0, 60], romantic: false, family: true, pool: false, desc: 'חניון לילה מוצל של רט"ג עם מים זורמים.' },
    { id: 'l_roshpina_zimmer', name: 'צימרים בראש פינה — אזור', region: 'galil', lat: 32.9682, lng: 35.5438, level: 'budget', priceNight: [350, 500], romantic: true, family: false, pool: false, desc: 'צימרים זוגיים במושבה הציורית.' },
    { id: 'l_galil_zimmer_mid', name: 'צימרים בגליל העליון — אזור', region: 'galil', lat: 33.0414, lng: 35.5750, level: 'mid', priceNight: [600, 950], romantic: true, family: true, pool: true, desc: 'צימרי גן עם ג\'קוזי ובריכה אזורית.' },
    { id: 'l_mizpe_hayamim', name: 'מצפה הימים (ספא)', region: 'galil', lat: 32.9700, lng: 35.5300, level: 'premium', priceNight: [1400, 2400], romantic: true, family: false, pool: true, desc: 'מלון בוטיק-ספא אורגני יוקרתי מעל ראש פינה.' },

    // גולן
    { id: 'l_yehudiya_camp', name: 'חניון לילה יהודיה', region: 'golan', lat: 32.9320, lng: 35.7100, level: 'free', priceNight: [0, 60], romantic: false, family: true, pool: false, desc: 'חניון רט"ג בכניסה לשמורת היהודיה.' },
    { id: 'l_golan_hostel', name: 'אכסניות וצימרים בקצרין — אזור', region: 'golan', lat: 32.9930, lng: 35.6890, level: 'budget', priceNight: [300, 500], romantic: false, family: true, pool: false, desc: 'לינה משפחתית זולה בלב הגולן.' },
    { id: 'l_golan_zimmer_mid', name: 'צימרים ברמת הגולן — אזור', region: 'golan', lat: 33.0000, lng: 35.7300, level: 'mid', priceNight: [550, 950], romantic: true, family: true, pool: true, desc: 'צימרי בוטיק כפריים עם ג\'קוזי ונוף.' },
    { id: 'l_chalets_golan', name: 'אחוזת אורבן / וילות גולן', region: 'golan', lat: 33.1700, lng: 35.7400, level: 'premium', priceNight: [1100, 1900], romantic: true, family: true, pool: true, desc: 'וילות יוקרה עם בריכה פרטית בצפון הגולן.' },

    // כנרת
    { id: 'l_kineret_camp', name: 'חניון חוף הכנרת (דוגית/דבוריה)', region: 'kineret', lat: 32.8500, lng: 35.6300, level: 'free', priceNight: [0, 80], romantic: false, family: true, pool: false, desc: 'לינת שטח בתשלום סמלי על שפת הים.' },
    { id: 'l_tiberias_budget', name: 'מלונות תקציב טבריה — אזור', region: 'kineret', lat: 32.7920, lng: 35.5310, level: 'budget', priceNight: [350, 500], romantic: false, family: true, pool: false, desc: 'מלונות עירוניים זולים קרוב לטיילת.' },
    { id: 'l_kibbutz_hotel', name: 'מלונות קיבוץ סביב הכנרת — אזור', region: 'kineret', lat: 32.7000, lng: 35.5700, level: 'mid', priceNight: [600, 1000], romantic: false, family: true, pool: true, desc: 'מלונות אורחים כפריים עם בריכה.' },
    { id: 'l_setai_sea', name: 'מלון יוקרה על הכנרת — אזור', region: 'kineret', lat: 32.7900, lng: 35.5450, level: 'premium', priceNight: [1200, 2200], romantic: true, family: true, pool: true, desc: 'מלון פרימיום מול הים עם ספא.' },

    // חיפה
    { id: 'l_carmel_camp', name: 'חניון לינה בכרמל (רט"ג)', region: 'haifa', lat: 32.7300, lng: 35.0300, level: 'free', priceNight: [0, 70], romantic: false, family: true, pool: false, desc: 'חניון לילה ביער הכרמל.' },
    { id: 'l_haifa_hostel', name: 'אכסניות חיפה (מושבה/עיר) — אזור', region: 'haifa', lat: 32.8190, lng: 34.9880, level: 'budget', priceNight: [300, 500], romantic: false, family: true, pool: false, desc: 'לינה עירונית זולה ליד הגנים.' },
    { id: 'l_haifa_boutique', name: 'מלונות בוטיק במושבה הגרמנית — אזור', region: 'haifa', lat: 32.8180, lng: 34.9890, level: 'mid', priceNight: [550, 950], romantic: true, family: false, pool: false, desc: 'בוטיק קסום במרחק הליכה מהגנים והים.' },
    { id: 'l_dan_carmel', name: 'מלון דן כרמל', region: 'haifa', lat: 32.8100, lng: 34.9900, level: 'premium', priceNight: [1000, 1800], romantic: true, family: true, pool: true, desc: 'מלון ותיק עם נוף מפרץ ובריכה.' },

    // תל אביב
    { id: 'l_tlv_hostel', name: 'אכסניות תל אביב — אזור', region: 'telaviv', lat: 32.0700, lng: 34.7700, level: 'budget', priceNight: [250, 500], romantic: false, family: false, pool: false, desc: 'הוסטלים ודירות קטנות במרכז העיר.' },
    { id: 'l_tlv_citycenter', name: 'מלונות עירוניים תל אביב — אזור', region: 'telaviv', lat: 32.0750, lng: 34.7740, level: 'mid', priceNight: [600, 1000], romantic: false, family: true, pool: false, desc: 'מלונות בוטיק במרכז קרוב לחוף ולשוק.' },
    { id: 'l_tlv_beachfront', name: 'מלונות חוף תל אביב — אזור', region: 'telaviv', lat: 32.0830, lng: 34.7680, level: 'premium', priceNight: [1200, 2500], romantic: true, family: true, pool: true, desc: 'מלוני חזית-ים מול הטיילת.' },
    { id: 'l_tlv_apt', name: 'דירות נופש בתל אביב — אזור', region: 'telaviv', lat: 32.0680, lng: 34.7720, level: 'mid', priceNight: [500, 950], romantic: true, family: true, pool: false, desc: 'דירות נופש לזוגות ומשפחות בלב העיר.' },

    // מרכז
    { id: 'l_modiin_hotel', name: 'מלונות מודיעין/שורש — אזור', region: 'merkaz', lat: 31.8950, lng: 35.0070, level: 'mid', priceNight: [550, 950], romantic: false, family: true, pool: true, desc: 'מלונות נופש בהרי ירושלים עם בריכה.' },
    { id: 'l_neve_ilan', name: 'מלון C נווה אילן / קריית ענבים', region: 'merkaz', lat: 31.8100, lng: 35.0900, level: 'premium', priceNight: [1000, 1700], romantic: true, family: true, pool: true, desc: 'מלון נופש פרימיום בכניסה לירושלים.' },
    { id: 'l_zimmer_shfela', name: 'צימרים בשפלה / מטה יהודה — אזור', region: 'merkaz', lat: 31.7560, lng: 35.0250, level: 'budget', priceNight: [350, 500], romantic: true, family: false, pool: false, desc: 'צימרים כפריים ירוקים בהרי האזור.' },
    { id: 'l_canada_camp', name: 'חניון לילה פארק קנדה/בריטניה', region: 'merkaz', lat: 31.8350, lng: 34.9780, level: 'free', priceNight: [0, 50], romantic: false, family: true, pool: false, desc: 'לינת שטח ביער נטוע מרכזי.' },

    // ירושלים
    { id: 'l_jlm_hostel', name: 'אכסניות העיר העתיקה/מרכז — אזור', region: 'jerusalem', lat: 31.7800, lng: 35.2200, level: 'budget', priceNight: [280, 500], romantic: false, family: true, pool: false, desc: 'אכסניות ולינה זולה קרוב לעיר העתיקה.' },
    { id: 'l_jlm_boutique', name: 'מלונות בוטיק ירושלים — אזור', region: 'jerusalem', lat: 31.7820, lng: 35.2180, level: 'mid', priceNight: [600, 1000], romantic: true, family: true, pool: false, desc: 'בוטיק במרכז העיר במרחק הליכה מהשוק.' },
    { id: 'l_king_david', name: 'מלון המלך דוד', region: 'jerusalem', lat: 31.7740, lng: 35.2230, level: 'premium', priceNight: [1500, 3000], romantic: true, family: true, pool: true, desc: 'מלון הדגל ההיסטורי של ירושלים מול חומות העיר.' },
    { id: 'l_jlm_camp', name: 'חניון לילה הרי ירושלים (רט"ג)', region: 'jerusalem', lat: 31.7660, lng: 35.1620, level: 'free', priceNight: [0, 60], romantic: false, family: true, pool: false, desc: 'לינת שטח ביערות סביב העיר.' },

    // ים המלח
    { id: 'l_eingedi_camp', name: 'חניון לילה עין גדי', region: 'deadsea', lat: 31.4500, lng: 35.3880, level: 'free', priceNight: [0, 70], romantic: false, family: true, pool: false, desc: 'חניון רט"ג סמוך לשמורה ולחוף.' },
    { id: 'l_eingedi_hostel', name: 'אכסניית עין גדי (אנ"א)', region: 'deadsea', lat: 31.4550, lng: 35.3860, level: 'budget', priceNight: [350, 500], romantic: false, family: true, pool: true, desc: 'אכסניה עם בריכה ליד השמורה.' },
    { id: 'l_kibbutz_eingedi', name: 'מלון קיבוץ עין גדי', region: 'deadsea', lat: 31.4600, lng: 35.3880, level: 'mid', priceNight: [700, 1000], romantic: true, family: true, pool: true, desc: 'מלון בגן בוטני ירוק ייחודי מעל הים.' },
    { id: 'l_bokek_spa', name: 'מלונות ספא עין בוקק — אזור', region: 'deadsea', lat: 31.2014, lng: 35.3639, level: 'premium', priceNight: [1000, 2200], romantic: true, family: true, pool: true, desc: 'מלונות ספא מול הים עם בריכות גופרית.' },

    // מצפה רמון
    { id: 'l_beresheet', name: 'מלון בראשית', region: 'ramon', lat: 30.6050, lng: 34.8030, level: 'premium', priceNight: [1500, 3000], romantic: true, family: true, pool: true, desc: 'מלון יוקרה מרהיב על שפת המכתש.' },
    { id: 'l_ramon_inn', name: 'מלון רמון אינן / ספיר', region: 'ramon', lat: 30.6090, lng: 34.8010, level: 'mid', priceNight: [550, 950], romantic: false, family: true, pool: true, desc: 'מלון נוח במרכז מצפה רמון.' },
    { id: 'l_silent_arrow', name: 'חאן החץ השקט (Silent Arrow)', region: 'ramon', lat: 30.6000, lng: 34.7900, level: 'budget', priceNight: [200, 450], romantic: true, family: false, pool: false, desc: 'גלמפינג ואוהלי מדבר ייחודיים על שפת המכתש.' },
    { id: 'l_ramon_camp', name: 'חניון לילה בא רמון / סהרונים', region: 'ramon', lat: 30.5200, lng: 34.7800, level: 'free', priceNight: [0, 70], romantic: false, family: true, pool: false, desc: 'חניון רט"ג בלב המכתש — שמיים מלאי כוכבים.' },

    // אילת
    { id: 'l_eilat_field', name: 'חניון לילה הרי אילת / שחמון', region: 'eilat', lat: 29.5800, lng: 34.9400, level: 'free', priceNight: [0, 80], romantic: false, family: true, pool: false, desc: 'לינת שטח באזור הרי אילת.' },
    { id: 'l_eilat_budget', name: 'מלונות תקציב ואכסניות אילת — אזור', region: 'eilat', lat: 29.5560, lng: 34.9510, level: 'budget', priceNight: [300, 500], romantic: false, family: true, pool: true, desc: 'מלונות זולים ואכסניות קרוב לטיילת.' },
    { id: 'l_eilat_mid', name: 'מלוני עיר אילת — אזור', region: 'eilat', lat: 29.5550, lng: 34.9530, level: 'mid', priceNight: [600, 1000], romantic: false, family: true, pool: true, desc: 'מלונות משפחתיים עם בריכה במרכז.' },
    { id: 'l_eilat_lagoon', name: 'מלונות לגונה/חוף אילת — אזור', region: 'eilat', lat: 29.5500, lng: 34.9550, level: 'premium', priceNight: [1100, 2500], romantic: true, family: true, pool: true, desc: 'מלוני דגל על הלגונה והחוף הצפוני.' }
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // 5) ABROAD — יעדים. מספרי daily/flight הועתקו בדיוק מטבלאות הסקיל;
  //    יעדים חדשים (גאורגיה, פראג/בודפשט שפוצלו) הוערכו באותו סגנון.
  //    daily/flight בש"ח. days = תבנית עד 10 ימים.
  // ──────────────────────────────────────────────────────────────────────────
  var abroad = {
    destinations: [

      // ---- יוון (מהסקיל) ----
      { id: 'greece', name: 'יוון (אתונה ואיים)', vibe: 'classic',
        daily: { lodging: [250, 500], food: [120, 200], attractions: [50, 100], transport: [50, 80] },
        flight: { low: [500, 900], regular: [800, 1400], peak: [1200, 2000] },
        bestSeasons: [SP, AU], language: 'יוונית (אנגלית נפוצה)', currency: 'אירו (€)', timeDiff: 'זהה לישראל',
        kosher: true, why: 'היסטוריה עתיקה, איים מהממים, אוכל מצוין וקרבה — שעתיים טיסה.',
        days: [
          { title: 'אתונה — האקרופוליס', morning: 'עליה לאקרופוליס והפרתנון מוקדם בבוקר', lunch: 'סובלאקי בשכונת מונסטיראקי', afternoon: 'שיטוט בפלאקה והאגורה העתיקה', evening: 'ארוחת ערב בטברנה עם נוף לאקרופוליס מואר', tip: 'קנו כרטיס משולב לאתרים העתיקים — חוסך כסף ותורים.' },
          { title: 'אתונה — מוזיאונים ושוק', morning: 'מוזיאון האקרופוליס החדש', lunch: 'שוק המרכזי (Varvakios) — דגים וגבינות', afternoon: 'גבעת ליקבטוס לתצפית על העיר', evening: 'בילוי בשכונת פסירי', tip: 'קהילה יהודית ובית כנסת ברחוב Melidoni.' },
          { title: 'הפלגה לאי (האידרה/אגינה)', morning: 'מעבורת מנמל פיראוס', lunch: 'דגים טריים בנמל האי', afternoon: 'חוף וטיול רגלי באי', evening: 'שקיעה וארוחה ליד הים', tip: 'אגינה קרובה (40 דק\') ומשפחתית; הידרה ציורית ללא מכוניות.' },
          { title: 'סנטוריני/מיקונוס (אופציונלי)', morning: 'טיסה/מעבורת לאי הקיקלאדי', lunch: 'מסעדה עם נוף לקלדרה', afternoon: 'כפרים לבנים — אויה/פירה', evening: 'שקיעה מפורסמת באויה', tip: 'הזמינו לינה מראש בקיץ — מתמלא ויקר.' },
          { title: 'חוף ומנוחה', morning: 'חוף וים', lunch: 'מזה יווני על החוף', afternoon: 'שנירקול או רכיבת ATV', evening: 'ערב נינוח בכפר', tip: 'השכרת רכב/קטנוע פותחת חופים נסתרים.' }
        ] },

      // ---- איטליה (מהסקיל) ----
      { id: 'italy', name: 'איטליה (רומא/טוסקנה)', vibe: 'classic',
        daily: { lodging: [300, 600], food: [150, 250], attractions: [60, 120], transport: [60, 100] },
        flight: { low: [600, 1100], regular: [1000, 1800], peak: [1500, 2500] },
        bestSeasons: [SP, AU], language: 'איטלקית', currency: 'אירו (€)', timeDiff: 'שעה אחורה מישראל',
        kosher: true, why: 'אוכל מהטובים בעולם, אמנות, היסטוריה ונופים — קלאסיקה אירופית.',
        days: [
          { title: 'רומא העתיקה', morning: 'קולוסיאום והפורום הרומי', lunch: 'פסטה בטרסטוורה', afternoon: 'הפנתיאון ומזרקת טרווי', evening: 'ארוחת ערב וג\'לאטו בכיכר נבונה', tip: 'הזמינו כרטיס לקולוסיאום מראש — התור ענק.' },
          { title: 'הוותיקן', morning: 'מוזיאוני הוותיקן והקפלה הסיסטינית', lunch: 'פיצה ברובע פראטי', afternoon: 'כיכר וכנסיית פטרוס הקדוש', evening: 'שכונת מונטי — בוטיקים ובארים', tip: 'הזמנה מראש לוותיקן חובה; הגיעו עם פתיחה.' },
          { title: 'פירנצה', morning: 'רכבת מהירה לפירנצה; הדואומו', lunch: 'פאניני בשוק המרכזי', afternoon: 'גלריית אופיצי וגשר פונטה וקיו', evening: 'ביסטקה פיורנטינה לארוחת ערב', tip: 'הזמינו את אופיצי חודש מראש.' },
          { title: 'טוסקנה / סיינה', morning: 'נסיעה בין כרמים וכפרים', lunch: 'אגריטוריזמו כפרי', afternoon: 'כיכר הקמפו בסיינה', evening: 'יין וגבינות בכפר', tip: 'השכרת רכב פותחת את לב טוסקנה.' },
          { title: 'פיזה/לוקה ומנוחה', morning: 'המגדל הנטוי של פיזה', lunch: 'מסעדה מקומית', afternoon: 'חומות לוקה ברכיבה על אופניים', evening: 'חזרה והכנות', tip: 'פיזה היא עצירה קצרה — חצי יום מספיק.' }
        ] },

      // ---- ספרד (מהסקיל) ----
      { id: 'spain', name: 'ספרד (ברצלונה/מדריד)', vibe: 'classic',
        daily: { lodging: [250, 500], food: [120, 200], attractions: [50, 100], transport: [50, 80] },
        flight: { low: [700, 1200], regular: [1100, 2000], peak: [1600, 2800] },
        bestSeasons: [SP, AU], language: 'ספרדית', currency: 'אירו (€)', timeDiff: 'שעה אחורה מישראל',
        kosher: true, why: 'אדריכלות גאודי, טאפאס, חופים ואווירה תוססת.',
        days: [
          { title: 'ברצלונה — גאודי', morning: 'סגרדה פמיליה (הזמנה מראש)', lunch: 'טאפאס ברובע גותי', afternoon: 'פארק גואל', evening: 'טיילת לאס ראמבלאס ושוק לה בוקריה', tip: 'קהילה יהודית ומסעדות כשרות בברצלונה.' },
          { title: 'ברצלונה — ים ועיר', morning: 'הרובע הגותי וקתדרלה', lunch: 'פאייה על חוף ברסלונטה', afternoon: 'מונז\'ואיק והכבל האווירי', evening: 'מזרקות הקסם של מונז\'ואיק', tip: 'כרטיס Hola BCN לתחבורה חוסך כסף.' },
          { title: 'נסיעה למדריד', morning: 'רכבת מהירה AVE למדריד', lunch: 'בוקדיו דה קלמרס', afternoon: 'מוזיאון הפראדו', evening: 'פלאזה מאיור וטאפאס', tip: 'הזמינו AVE מראש למחיר טוב.' },
          { title: 'מדריד — ארמון ופארק', morning: 'הארמון המלכותי', lunch: 'שוק סן מיגל', afternoon: 'פארק רטירו', evening: 'שכונת לה לטינה — באר-הופינג', tip: 'הספרדים אוכלים ערב מאוחר (21:00).' },
          { title: 'טולדו (טיול יום)', morning: 'נסיעה לטולדו ההיסטורית', lunch: 'מסעדה בעיר העתיקה', afternoon: 'קתדרלה ובית הכנסת אל טרנסיטו', evening: 'חזרה למדריד', tip: 'טולדו = בירת ספרד היהודית בעבר — שווה ביקור.' }
        ] },

      // ---- צ'כיה / פראג (פוצל מ"צ'כיה/הונגריה") ----
      { id: 'czech', name: 'צ\'כיה (פראג)', vibe: 'classic',
        daily: { lodging: [200, 400], food: [80, 150], attractions: [40, 80], transport: [30, 60] },
        flight: { low: [600, 1000], regular: [900, 1600], peak: [1300, 2200] },
        bestSeasons: [SP, AU], language: 'צ\'כית (אנגלית בתיירות)', currency: 'קורונה צ\'כית (CZK)', timeDiff: 'שעה אחורה מישראל',
        kosher: true, why: 'אחת הערים היפות באירופה, זולה, עם בירה מצוינת ואווירת אגדה.',
        days: [
          { title: 'העיר העתיקה', morning: 'כיכר העיר העתיקה ושעון האסטרונומי', lunch: 'גולש בקנקן לחם', afternoon: 'גשר קארל וטירת פראג', evening: 'בירה צ\'כית ופלזנר במרתף', tip: 'גשר קארל ריק וקסום בשעה 7 בבוקר.' },
          { title: 'הרובע היהודי (יוזפוב)', morning: 'בית הכנסת העתיק-חדש ובית הקברות', lunch: 'מסעדה כשרה ברובע', afternoon: 'מוזיאון יהודי וכנסיית טין', evening: 'תיאטרון בובות או קונצרט', tip: 'פראג שמרה קהילה יהודית עשירה — סיור מודרך מומלץ.' },
          { title: 'טירה וגבעות', morning: 'פטרשין (מגדל תצפית)', lunch: 'פיקניק בגן', afternoon: 'הקסטרו והקתדרלה', evening: 'שייט על נהר הוולטבה', tip: 'כרטיס תחבורה יומי משתלם מאוד.' },
          { title: 'צסקי קרומלוב (טיול יום)', morning: 'נסיעה לעיירת האגדות', lunch: 'מסעדה על הנהר', afternoon: 'הטירה והעיר העתיקה', evening: 'חזרה לפראג', tip: 'אחת העיירות היפות באירופה — אל תפספסו.' }
        ] },

      // ---- הונגריה / בודפשט (פוצל מ"צ'כיה/הונגריה") ----
      { id: 'hungary', name: 'הונגריה (בודפשט)', vibe: 'classic',
        daily: { lodging: [200, 400], food: [80, 150], attractions: [40, 80], transport: [30, 60] },
        flight: { low: [550, 950], regular: [850, 1500], peak: [1200, 2100] },
        bestSeasons: [SP, AU], language: 'הונגרית (אנגלית בתיירות)', currency: 'פורינט (HUF)', timeDiff: 'שעה אחורה מישראל',
        kosher: true, why: 'תרמליות מפנקות, אוכל מדהים, אדריכלות מרהיבה ומחירים נוחים.',
        days: [
          { title: 'באדה ופשט', morning: 'מבצר באדה והבסטיון הדייגים', lunch: 'גולאש הונגרי אותנטי', afternoon: 'בניין הפרלמנט והשרשרת', evening: 'שייט שקיעה על הדנובה', tip: 'הפרלמנט מואר בלילה — מחזה עוצר נשימה.' },
          { title: 'תרמליות ושוק', morning: 'מרחצאות סצ\'ני התרמליים', lunch: 'שוק המרכזי הגדול (לאנגוש)', afternoon: 'שדרת אנדרשי והבזיליקה', evening: 'רוב-בר (ruin bar) ברובע השביעי', tip: 'הזמינו כרטיס לסצ\'ני מראש; הביאו כפכפים.' },
          { title: 'הרובע היהודי', morning: 'בית הכנסת הגדול ברחוב דוהאני', lunch: 'מסעדה כשרה ברובע השביעי', afternoon: 'מוזיאון השואה ואנדרטת הנעליים', evening: 'אוכל רחוב ובארים', tip: 'הקהילה היהודית הגדולה באירופה התיכונה.' },
          { title: 'אי מרגרט ומנוחה', morning: 'אופניים באי מרגרט הירוק', lunch: 'בית קפה ויני (קווי שטרודל)', afternoon: 'גבעת גלרט ותצפית', evening: 'קונצרט או אופרה', tip: 'בודפשט זולה ביחס לאיכות — שווה כל אגורה.' }
        ] },

      // ---- תאילנד (מהסקיל) ----
      { id: 'thailand', name: 'תאילנד', vibe: 'adventure',
        daily: { lodging: [100, 300], food: [50, 120], attractions: [30, 80], transport: [20, 50] },
        flight: { low: [1800, 3000], regular: [2500, 4000], peak: [3500, 5500] },
        bestSeasons: [WI], language: 'תאית (אנגלית בתיירות)', currency: 'באט (THB)', timeDiff: '5 שעות קדימה מישראל',
        kosher: true, why: 'חופים גן-עדן, אוכל מדהים וזול, אנשים חמים והרפתקה אסייתית.',
        days: [
          { title: 'בנגקוק — מקדשים', morning: 'הארמון הגדול וואט פו', lunch: 'פאד-תאי בדוכן רחוב', afternoon: 'שייט בתעלות (קלונג)', evening: 'שוק לילה ועיסוי תאי', tip: 'לבוש צנוע למקדשים; היזהרו ממוניות-טוק-טוק יקרות.' },
          { title: 'בנגקוק — שווקים', morning: 'השוק הצף דמנואן סדואק', lunch: 'מאכלי רחוב', afternoon: 'שוק צ\'אטוצ\'אק (בסופ"ש)', evening: 'רוף-טופ בר עם נוף לעיר', tip: 'בית חב"ד ומסעדות כשרות בכאו סאן.' },
          { title: 'צ\'יאנג מאי', morning: 'טיסה פנימית לצפון', lunch: 'קאו סוי (מרק נודלס צפוני)', afternoon: 'מקדש דוי סותפ', evening: 'שוק הלילה (Night Bazaar)', tip: 'צ\'יאנג מאי קרירה ורגועה יותר מבנגקוק.' },
          { title: 'פילים וטבע', morning: 'מקלט פילים אתי (ללא רכיבה)', lunch: 'פיקניק בטבע', afternoon: 'מפלים ושבילי ג\'ונגל', evening: 'סדנת בישול תאי', tip: 'בחרו מקלט פילים שלא מרכיב על הפילים.' },
          { title: 'איים בדרום (קופנגן/קופיפי)', morning: 'טיסה לדרום וחוף', lunch: 'דגים על החוף', afternoon: 'שנירקול ושייט סירה', evening: 'מסיבת חוף / שקיעה', tip: 'הולך מסיבות = קופנגן; שקט = קוסמוי/קראבי.' }
        ] },

      // ---- קפריסין (מהסקיל) ----
      { id: 'cyprus', name: 'קפריסין', vibe: 'classic',
        daily: { lodging: [200, 400], food: [100, 180], attractions: [40, 80], transport: [50, 100] },
        flight: { low: [400, 700], regular: [600, 1000], peak: [800, 1400] },
        bestSeasons: [SP, AU, SU], language: 'יוונית/אנגלית', currency: 'אירו (€)', timeDiff: 'זהה לישראל',
        kosher: true, why: 'הכי קרוב (45 דק\'), חופים, יין ואווירת חופשה רגועה למשפחות.',
        days: [
          { title: 'לרנקה', morning: 'טיילת פיניקודס וחוף', lunch: 'מזה קפריסאי על החוף', afternoon: 'אגם המלח והפלמינגו (חורף)', evening: 'ארוחת דגים בנמל', tip: 'לרנקה קרובה לשדה — נוחה ליום ראשון.' },
          { title: 'פאפוס', morning: 'הפסיפסים והאתר הארכיאולוגי', lunch: 'טברנה בעיר העתיקה', afternoon: 'סלע אפרודיטה וחוף', evening: 'נמל פאפוס המואר', tip: 'אתר אונסק"ו עם פסיפסים מרהיבים.' },
          { title: 'הרי טרודוס', morning: 'נסיעה לכפרי ההר וכרמים', lunch: 'יין מקומי וגבינת חלומי', afternoon: 'מנזרים ומפלים', evening: 'חזרה לחוף', tip: 'קריר בהרים גם בקיץ — שכבה נוספת.' },
          { title: 'איה נאפה / חופים', morning: 'חוף ניסי ביץ\' התכול', lunch: 'אוכל ים תיכוני', afternoon: 'מערות הים בקייפ גרקו', evening: 'טיילת ובילוי', tip: 'מים צלולים ורדודים — מצוין לילדים.' }
        ] },

      // ---- טורקיה (מהסקיל) ----
      { id: 'turkey', name: 'טורקיה (איסטנבול/קפדוקיה)', vibe: 'classic',
        daily: { lodging: [150, 350], food: [70, 150], attractions: [30, 70], transport: [30, 60] },
        flight: { low: [400, 800], regular: [700, 1200], peak: [1000, 1800] },
        bestSeasons: [SP, AU], language: 'טורקית', currency: 'לירה טורקית (TRY)', timeDiff: 'זהה לישראל',
        kosher: true, why: 'מזרח ומערב נפגשים — שווקים, אוכל מדהים, היסטוריה וזול.',
        days: [
          { title: 'איסטנבול — העיר העתיקה', morning: 'איה סופיה והמסגד הכחול', lunch: 'קבב וטוסט בלוקנטה', afternoon: 'ארמון טופקאפי', evening: 'הבזאר המקורה ושייט בוספורוס', tip: 'הבזאר הגדול ענק — סכמו מחירים בנעימות.' },
          { title: 'איסטנבול — שני יבשות', morning: 'בזאר התבלינים', lunch: 'דגים תחת גשר גלאטה', afternoon: 'מגדל גלאטה והרובע המודרני', evening: 'שכונת קאדיקוי (הצד האסייתי)', tip: 'יש מסעדות כשרות ובתי כנסת בשכונת גלאטה.' },
          { title: 'קפדוקיה', morning: 'טיסה פנימית; כדור פורח על הסלעים', lunch: 'מנזה (תבשיל בכד חרס)', afternoon: 'עיר תת-קרקעית ועמקי הסלעים', evening: 'לינה במלון מערה', tip: 'הזמינו טיסת כדור פורח מראש — חוויית חיים.' },
          { title: 'גורם והעמקים', morning: 'מוזיאון גורם הפתוח', lunch: 'כפר מקומי', afternoon: 'טיול בעמק האהבה/ורד', evening: 'שקיעה מנקודת תצפית', tip: 'נעלי הליכה — הרבה שבילי עפר.' }
        ] },

      // ---- פורטוגל (מהסקיל) ----
      { id: 'portugal', name: 'פורטוגל (ליסבון/פורטו)', vibe: 'classic',
        daily: { lodging: [200, 450], food: [100, 180], attractions: [40, 80], transport: [40, 70] },
        flight: { low: [700, 1200], regular: [1000, 1800], peak: [1500, 2500] },
        bestSeasons: [SP, AU], language: 'פורטוגזית', currency: 'אירו (€)', timeDiff: 'שעתיים אחורה מישראל',
        kosher: false, why: 'יין פורט, נהר, פאדו, חופים ואווירה רגועה ולא תיירותית-מדי.',
        days: [
          { title: 'ליסבון — אלפמה', morning: 'טראם 28 ומבצר סאו ז\'ורז\'ה', lunch: 'באקלאו (דג מלוח) במסעדה מקומית', afternoon: 'שכונת אלפמה ונקודות תצפית', evening: 'מופע פאדו וארוחת ערב', tip: 'הטראם הצהוב 28 — סעו מוקדם לפני העומס.' },
          { title: 'בלם וסינטרה', morning: 'מגדל בלם והמנזר', lunch: 'פסטל דה נאטה המקורי', afternoon: 'ארמון פנה בסינטרה', evening: 'חזרה לליסבון, רובע ביירו אלטו', tip: 'סינטרה קסומה — הקדישו לה חצי יום לפחות.' },
          { title: 'נסיעה לפורטו', morning: 'רכבת צפונה לפורטו', lunch: 'פרנצ\'זיניה (כריך פורטו)', afternoon: 'גשר דום לואיש ומרתפי פורט', evening: 'טעימת יין פורט בגאיה', tip: 'מרתפי היין בגדה הדרומית — סיור + טעימה.' },
          { title: 'פורטו עתיקה', morning: 'תחנת סאו בנטו ובוקסטור', lunch: 'דגים על הנהר', afternoon: 'שכונת ריביירה לאורך הדואורו', evening: 'שייט שקיעה על הדואורו', tip: 'חנות הספרים Lello — השראה להוגוורטס.' }
        ] },

      // ---- גאורגיה (חדש — הוערך באותו סגנון) ----
      { id: 'georgia', name: 'גאורגיה (טביליסי/בטומי)', vibe: 'adventure',
        daily: { lodging: [120, 300], food: [60, 130], attractions: [30, 70], transport: [25, 60] },
        flight: { low: [450, 800], regular: [700, 1300], peak: [1100, 1900] },
        bestSeasons: [SP, AU, SU], language: 'גאורגית (רוסית/אנגלית)', currency: 'לארי (GEL)', timeDiff: 'שעה קדימה מישראל',
        kosher: true, why: 'הרים מרהיבים, יין עתיק, אוכל מעולה ומחירים נמוכים מאוד — אהוב על ישראלים.',
        days: [
          { title: 'טביליסי העתיקה', morning: 'העיר העתיקה ומבצר נריקאלה ברכבל', lunch: 'חינקאלי וח\'צ\'אפורי', afternoon: 'מרחצאות הגופרית באבנוטובני', evening: 'טיילת על נהר המטקווארי', tip: 'קהילה יהודית עתיקה ומסעדות כשרות בטביליסי.' },
          { title: 'מצחטה וקזבגי', morning: 'נסיעה לכנסיית הצלמינדה בקזבגי', lunch: 'מסעדה הררית', afternoon: 'נופי הרי קווקז והכביש הצבאי', evening: 'חזרה לטביליסי', tip: 'הכביש הצבאי הגאורגי — אחד היפים בעולם.' },
          { title: 'אזור היין קחתי', morning: 'נסיעה לכרמי קחתי', lunch: 'סופרה (סעודה) גאורגית', afternoon: 'טעימות יין בכדי חרס (קוורי)', evening: 'מנזר באודזה', tip: 'גאורגיה היא ערש היין בעולם — 8,000 שנה.' },
          { title: 'בטומי והים השחור', morning: 'טיסה/נסיעה לבטומי', lunch: 'דגים על החוף', afternoon: 'טיילת בטומי והגן הבוטני', evening: 'בילוי בעיר הנופש', tip: 'בטומי = לאס וגאס של הים השחור.' }
        ] },

      // ---- בולגריה (חדש — הוערך) ----
      { id: 'bulgaria', name: 'בולגריה (סופיה/בנסקו)', vibe: 'adventure',
        daily: { lodging: [120, 300], food: [60, 120], attractions: [25, 60], transport: [25, 50] },
        flight: { low: [400, 750], regular: [650, 1200], peak: [1000, 1700] },
        bestSeasons: [SU, WI], language: 'בולגרית', currency: 'לב (BGN)', timeDiff: 'זהה לישראל',
        kosher: false, why: 'סקי זול בחורף, הרים בקיץ, מנזרים ומחירים מהנמוכים באירופה.',
        days: [
          { title: 'סופיה', morning: 'קתדרלת אלכסנדר נבסקי', lunch: 'מטבח בולגרי מקומי', afternoon: 'שדרת ויטושה ומוזיאונים', evening: 'בילוי במרכז העיר', tip: 'בית כנסת סופיה — מהגדולים בבלקן.' },
          { title: 'מנזר רילה', morning: 'נסיעה למנזר רילה ההיסטורי', lunch: 'מסעדה הררית עם פסטרמה', afternoon: 'טיול בהרי רילה', evening: 'חזרה לסופיה', tip: 'אתר אונסק"ו — מהיפים בבלקן.' },
          { title: 'בנסקו (סקי/הרים)', morning: 'נסיעה לאתר הסקי בנסקו', lunch: 'בנקה (מאפה גבינה)', afternoon: 'סקי בחורף / הליכה בקיץ', evening: 'מכאנה מסורתית עם מוזיקה', tip: 'בנסקו = סקי זול מאוד יחסית לאלפים.' }
        ] },

      // ---- מונטנגרו (חדש — הוערך) ----
      { id: 'montenegro', name: 'מונטנגרו (קוטור/בודבה)', vibe: 'classic',
        daily: { lodging: [180, 400], food: [90, 170], attractions: [30, 70], transport: [40, 80] },
        flight: { low: [600, 1000], regular: [900, 1500], peak: [1300, 2100] },
        bestSeasons: [SP, SU, AU], language: 'מונטנגרית', currency: 'אירו (€)', timeDiff: 'שעה אחורה מישראל',
        kosher: false, why: 'מפרצים דמויי פיורד, עיירות עתיקות וחופים אדריאטיים — יפהפה ולא יקר.',
        days: [
          { title: 'קוטור', morning: 'העיר העתיקה וטיפוס לחומות', lunch: 'דגים במפרץ', afternoon: 'שייט במפרץ קוטור', evening: 'ערב בעיר העתיקה', tip: 'הטיפוס לחומות תלול — בוקר מוקדם בקיץ.' },
          { title: 'בודבה והחוף', morning: 'העיר העתיקה של בודבה', lunch: 'מסעדה על הטיילת', afternoon: 'סווטי סטפן (האי המפורסם)', evening: 'חוף ובילוי', tip: 'סווטי סטפן — האי-מלון המצולם ביותר.' },
          { title: 'הרים ואגם סקאדר', morning: 'אגם סקאדר ושייט', lunch: 'דגי אגם', afternoon: 'הפארק הלאומי דורמיטור (אופציונלי)', evening: 'חזרה לחוף', tip: 'מונטנגרו קומפקטית — הכל קרוב.' }
        ] }
    ]
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 6) PACKING / CHECKLIST / PITFALLS / ISRAEL-NOTES (מהסקיל)
  // ──────────────────────────────────────────────────────────────────────────
  var packing = {
    base: ['תעודות מזהות/דרכון', 'ארנק וכרטיסי אשראי', 'טלפון ומטען', 'מטען נייד (פאוורבנק)',
           'תרופות אישיות', 'משקפי שמש', 'בקבוק מים רב-פעמי', 'ערכת עזרה ראשונה קטנה', 'מטרייה/מעיל גשם קל'],
    summer: ['כובע רחב שוליים', 'קרם הגנה SPF 50', 'בגדי כותנה קלים', 'כפכפים/סנדלים', 'בגד ים ומגבת',
             'מאוורר יד/מטפחת קירור', 'ריפלנט יתושים'],
    winter: ['מעיל חם ועמיד למים', 'שכבות (פליז/סווטשירט)', 'כובע גרב וכפפות', 'נעליים אטומות',
             'מטרייה חזקה', 'גרביים תרמיים'],
    kids: ['חטיפים ושתייה לדרך', 'בגדים להחלפה', 'משחק/ספר לרכב', 'כובע וקרם הגנה לילדים',
           'מגבונים ושקיות', 'תרופות ילדים (אקמול/נורופן)'],
    baby: ['חיתולים ומגבונים', 'בקבוקים/מטחנה', 'מנשא או עגלה קלה', 'בגדי החלפה רבים',
           'שמיכת חיתול/צל', 'אטמי אוזניים לטיסה', 'תרכובת/מזון תינוקות'],
    hiking: ['נעלי הליכה טובות', 'תרמיל יום', 'מים בשפע (3 ליטר לאדם)', 'נעלי מים (למסלולים רטובים)',
             'כובע וקרם הגנה', 'חטיפי אנרגיה', 'מקל הליכה (אופציונלי)', 'אפליקציית ניווט אופליין'],
    beach: ['בגד ים ומגבת', 'מטרייה/צל נייד', 'קרם הגנה עמיד למים', 'כפכפים', 'משקפת/מסכת שנירקול',
            'שקית אטומה לטלפון', 'מים קרים בצידנית'],
    abroad: ['מתאם חשמל בינלאומי', 'כרטיס נטען רב-מטבעי/מזומן מקומי', 'העתקי מסמכים בענן', 'ביטוח נסיעות מודפס',
             'אפליקציות מפות וגוגל-תרגום אופליין', 'כרטיס SIM מקומי/eSIM', 'תיק צד נגד גנבים']
  };

  var checklist = [
    'דרכון בתוקף (לפחות 6 חודשים מיום החזרה)',
    'ביטוח נסיעות (כולל כיסוי רפואי וביטול)',
    'ויזה — בדקו אם נדרשת ליעד',
    'חיסונים — בדקו עם רופא/מרפאת מטיילים אם נדרשים',
    'העתק מסמכים (דרכון, ביטוח, כרטיסים) בענן ובמייל',
    'הודעה לבנק/חברת אשראי על נסיעה לחו"ל',
    'המרת מט"ח מראש / כרטיס נטען רב-מטבעי',
    'הורדת מפות אופליין ואפליקציות ניווט/תרגום'
  ];

  var pitfalls = [
    { trap: '"נראה לי שנספיק הכל"', truth: 'לא. 2-3 אטרקציות ביום זה מקסימום. יותר מזה = ריצה, לא טיול.' },
    { trap: '"נחסוך על ביטוח נסיעות"', truth: 'לא שווה. ביקור אחד בחדר מיון באירופה = 5,000-20,000 ש"ח. ביטוח = 100-300 ש"ח.' },
    { trap: '"נמיר כסף בשדה התעופה"', truth: 'הכי יקר. המירו מראש בבנק, קחו כרטיס נטען רב-מטבעי, או משכו מכספומט מקומי.' },
    { trap: '"לא צריך להזמין מראש"', truth: 'תלוי. מוזיאונים פופולריים (ותיקן, אופיצי, אלהמברה) — חודש מראש. מסעדות — שבוע.' },
    { trap: '"הילדים יסתדרו עם מה שיש"', truth: 'לא. תכננו לפחות פעילות אחת ביום שמיועדת רק להם — פארק מים / גלידה / חנות צעצועים.' },
    { trap: '"נתכנן ביום הראשון"', truth: 'היום הראשון תמיד הולך. ג\'ט-לג, צ\'ק-אין והתמצאות. תכננו יום ראשון קליל.' },
    { trap: '"זול = לא טוב"', truth: 'לא נכון. בודפשט, קרקוב, פורטו — זולים ומדהימים. יוקר אינו שווה-ערך לחוויה.' }
  ];

  var israelNotes = {
    shabbat: 'בשבת: תחבורה ציבורית מושבתת ברוב הארץ; אתרי רט"ג, חופים, טיילות וטבע — פתוחים. ' +
             'שווקים (מחנה יהודה, הכרמל) ומוזיאונים רבים סגורים; בתל אביב חלק מהמסעדות והאטרקציות (שרונה, נמל, מוזיאון ת"א) פתוחים. ' +
             'בירושלים רוב העסקים סגורים. תכננו דלק, אוכל וכניסות מראש.',
    seasons: 'נחלים ומסלולי מים בצפון = חורף ואביב בלבד (קיץ הם יבשים/חמים). מדבר, ים המלח, אילת ומצדה = לא בקיץ ' +
             '(חום קיצוני; טיולים בבוקר מוקדם בלבד). אביב (מרץ-מאי) וסתיו (אוקטובר-נובמבר) — מזג האוויר האידיאלי לרוב הארץ. ' +
             'היזהרו משיטפונות בנחלי מדבר אחרי גשם — בדקו תחזית ואזהרות רט"ג.',
    kids: 'גילאי 0-3: צל + מים + קרבה לרכב; קצב איטי והפסקות תכופות. גילאי 4-10: שבילים קצרים, מים לשכשוך וגלידה בסוף. ' +
          'נוער (11+): מתאים לאתגרים — אבסיילינג, מערות, מסלולי מים ארוכים. תכננו לפחות פעילות "כיף" אחת ביום לכל גיל.'
  };

  // ──────────────────────────────────────────────────────────────────────────
  // חשיפת ה-API הציבורי (קריאה בלבד מבחינת הצרכנים)
  // ──────────────────────────────────────────────────────────────────────────
  window.TripPlannerData = {
    regions: regions,
    attractions: attractions,
    restaurants: restaurants,
    lodging: lodging,
    abroad: abroad,
    packing: packing,
    checklist: checklist,
    pitfalls: pitfalls,
    israelNotes: israelNotes
  };

})();
