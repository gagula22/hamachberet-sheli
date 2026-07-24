(function () {
  // Generic editable helpers: debounce + image compression. No DOM-feature coupling.
  function debounce(fn, wait = 400) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // דחיסת תמונה לשמירה — איכות קודמת לגודל (תוקן יסודית לפי משוב חוזר).
  // ⚠️ הבאג שהיה: צילום מסך של גרף ב-PNG עובר בקלות 2.8MB → קודד מחדש
  // ל-WebP/JPEG מאבד → קווים דקים וטקסט זעיר הצטטשו.
  // העיקרון החדש:
  //   • אם התמונה לא חורגת ב-מימדים מ-3000px — נשמרת מדויקת בית-בבית,
  //     בכל גודל קובץ. אפס קידוד-מחדש = אפס איבוד (קריטי לגרפים/טקסט).
  //   • רק תמונת-ענק (>3000px) מוקטנת ל-3000px ומקודדת ב-WebP 0.95
  //     (כמעט-lossless) עם נפילה ל-JPEG 0.95. הקטנת-מימדים שומרת חדות.
  //   • לעולם לא מחזירים תוצאה גדולה/גרועה מהמקור.
  // הערה: תמונות-ענק נשמרות מקומית במלואן; firebase-sync._sizeSafeTopic
  // מגן על סנכרון הענן (מסיר base64 ענק מהדוק לפני שליחה, שומר מקומית).
  // דחיסת תמונה חכמה — שומרת חדות בגודל התצוגה (A4/680px) ומקטינה מספיק כדי
  // שדף מחברת יישאר מתחת לגבול 1MB של Firestore, כך שהתמונות מסתנכרנות לענן.
  //   • תקרת מימדים 2000px (~3x רוחב התצוגה → חד גם במסכי רטינה).
  //   • מקודד WebP/JPEG ויורד בהדרגה עד שהתמונה ~150KB (כך ~5 תמונות נכנסות בדף).
  //   • לעולם לא מחזיר תוצאה גדולה מהמקור.
  function compressImage(dataUrl, maxW, quality) {
    maxW = maxW || 2000;
    quality = quality || 0.9;
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        try {
          const nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
          if (!nw || !nh) { resolve(dataUrl); return; }
          const TARGET_BYTES = 150 * 1024;             // ~150KB per image
          // איכות (23.7.2026): תמונה שכבר עומדת ביעד-הגודל ובתקרת-המימדים
          // מוחזרת ביט-בביט — אפס קידוד-מחדש = אפס איבוד-דורי. זה המקרה
          // הנפוץ (תמונות וורד/צילומי-מסך קטנים); קודם גם הן עברו קידוד
          // webp אחד מיותר. פתקים כבדים ממילא מוגנים עכשיו ע"י ההעברה-לענן,
          // כך שהוויתור על הצמצום-הזעיר הזה בטוח.
          if (nw <= maxW && dataUrl.length * 0.75 <= TARGET_BYTES) { resolve(dataUrl); return; }
          const widths = [Math.min(nw, maxW), Math.min(nw, 1600), Math.min(nw, 1280)];
          const quals  = [quality, 0.82, 0.72];
          let best = dataUrl;
          for (let i = 0; i < widths.length; i++) {
            const w = widths[i], scale = w / nw, h = Math.round(nh * scale);
            if (!w || !h) continue;
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            let out = c.toDataURL('image/webp', quals[i]);
            if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/jpeg', quals[i]);
            if (out.length < best.length) best = out;
            if (out.length * 0.75 <= TARGET_BYTES) { resolve(out.length < dataUrl.length ? out : dataUrl); return; }
          }
          resolve(best.length < dataUrl.length ? best : dataUrl);
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  window.EditableUtils = { debounce: debounce, compressImage: compressImage };
})();