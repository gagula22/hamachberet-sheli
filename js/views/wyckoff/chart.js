(function () {
  'use strict';
  // ── wyckoff/chart.js — מצייר נרות+נפח מוער (canvas) → window.WyckoffChart ──
  // אחריות יחידה: ציור גרף נרות יפניים + היסטוגרמת נפח + תיוג מינימלי (SC/AR/UT),
  // קווי טווח (תמיכה/התנגדות), קו מחיר נוכחי, וחיצי נפח. אפס רשת/לוגיקה.

  function fmtDate(ms) {
    var d = new Date(ms);
    return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
  }
  function kfmt(p) { return '$' + (Math.round(p / 100) / 10) + 'K'; }

  // candles: [{t,o,h,l,c,v}] oldest→newest. opts: {marks:{idx:'SC'}, sup, res, take}
  function draw(canvas, candles, opts) {
    if (!canvas || !candles || !candles.length) return;
    opts = opts || {};
    var data = opts.take ? candles.slice(candles.length - opts.take) : candles;
    var baseIdx = candles.length - data.length;
    var x = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height, padL = 60, padR = 14, padT = 16, volH = 80, gap = 8;
    var priceH = H - padT - volH - gap - 22;
    var min = Math.min.apply(null, data.map(function (c) { return c.l; })) * 0.996;
    var max = Math.max.apply(null, data.map(function (c) { return c.h; })) * 1.004;
    var maxV = Math.max.apply(null, data.map(function (c) { return c.v; })) || 1;
    var n = data.length, cw = (W - padL - padR) / n;
    function X(i) { return padL + cw * i + cw / 2; }
    function Y(p) { return padT + (max - p) / (max - min) * priceH; }

    // רקע בהיר (תואם תבנית הסקיל — לא שחור)
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    // gridlines + price labels
    x.strokeStyle = '#eef1f5'; x.fillStyle = '#7a8699'; x.font = '11px Segoe UI'; x.textAlign = 'right';
    for (var g = 0; g <= 4; g++) {
      var p = min + (max - min) * g / 4, yy = Y(p);
      x.beginPath(); x.moveTo(padL, yy); x.lineTo(W - padR, yy); x.stroke();
      x.fillText(kfmt(p), padL - 6, yy + 3);
    }
    // range lines
    if (opts.res != null) { x.setLineDash([5, 4]); x.strokeStyle = '#d2483b'; x.beginPath(); x.moveTo(padL, Y(opts.res)); x.lineTo(W - padR, Y(opts.res)); x.stroke(); }
    if (opts.sup != null) { x.setLineDash([5, 4]); x.strokeStyle = '#1f9d57'; x.beginPath(); x.moveTo(padL, Y(opts.sup)); x.lineTo(W - padR, Y(opts.sup)); x.stroke(); }
    x.setLineDash([]);
    // קווי-רמה לתרחיש (כניסה/SL/יעדים) — opts.levels=[{price,color,label}]
    if (opts.levels) opts.levels.forEach(function (lv) {
      if (lv.price < min || lv.price > max) return;
      x.strokeStyle = lv.color; x.setLineDash([6, 3]); x.lineWidth = 1.3;
      x.beginPath(); x.moveTo(padL, Y(lv.price)); x.lineTo(W - padR, Y(lv.price)); x.stroke(); x.setLineDash([]);
      x.fillStyle = lv.color; x.font = 'bold 11px Segoe UI'; x.textAlign = 'left';
      x.fillText(lv.label, padL + 4, Y(lv.price) - 3);
    });
    // candles + volume
    data.forEach(function (c, i) {
      var up = c.c >= c.o, col = up ? '#2faa6a' : '#e06a62', cx = X(i);
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1;
      x.beginPath(); x.moveTo(cx, Y(c.h)); x.lineTo(cx, Y(c.l)); x.stroke();
      var bw = Math.max(2, cw * 0.62);
      x.fillRect(cx - bw / 2, Math.min(Y(c.o), Y(c.c)), bw, Math.max(2, Math.abs(Y(c.c) - Y(c.o))));
      var vh = c.v / maxV * volH;
      x.globalAlpha = 0.5; x.fillRect(cx - bw / 2, H - 22 - vh, bw, vh); x.globalAlpha = 1;
    });
    // marks (global indices → local)
    if (opts.marks) {
      Object.keys(opts.marks).forEach(function (gi) {
        var li = +gi - baseIdx;
        if (li < 0 || li >= n) return;
        var lab = opts.marks[gi], c = data[li], below = (lab === 'SC' || lab === 'Spring');
        var cx = X(li), cy = Y(below ? c.l : c.h);
        x.fillStyle = below ? '#cf9224' : '#4f7fd1'; x.font = 'bold 12px Segoe UI'; x.textAlign = 'center';
        x.fillText(lab, cx, cy + (below ? 16 : -7));
        x.beginPath(); x.arc(cx, cy, 3, 0, 7); x.fill();
      });
    }
    // חץ מגמת-ווליום על ההיסטוגרמה (היצע/ביקוש לפי וויקוף) — opts.volNote
    if (opts.volNote) {
      var vTop = H - 22 - volH, vBot = H - 22, slope = opts.volNote.slope;
      var ax1 = padL + (W - padL - padR) * 0.34, ax2 = W - padR - 8, ay1, ay2;
      if (slope < 0) { ay1 = vTop + volH * 0.22; ay2 = vBot - volH * 0.10; }
      else if (slope > 0) { ay1 = vBot - volH * 0.10; ay2 = vTop + volH * 0.22; }
      else { ay1 = ay2 = vTop + volH * 0.4; }
      x.strokeStyle = opts.volNote.color; x.fillStyle = opts.volNote.color; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(ax1, ay1); x.lineTo(ax2, ay2); x.stroke();
      var ang = Math.atan2(ay2 - ay1, ax2 - ax1);
      x.beginPath(); x.moveTo(ax2, ay2);
      x.lineTo(ax2 - 9 * Math.cos(ang - 0.45), ay2 - 9 * Math.sin(ang - 0.45));
      x.lineTo(ax2 - 9 * Math.cos(ang + 0.45), ay2 - 9 * Math.sin(ang + 0.45));
      x.closePath(); x.fill();
      x.font = 'bold 11px Segoe UI'; x.textAlign = 'right';
      x.fillText(opts.volNote.text, ax2, vTop - 4);
    }
    // current price line
    var last = data[n - 1].c;
    x.fillStyle = '#2b3648'; x.textAlign = 'left'; x.font = 'bold 11px Segoe UI';
    x.fillText('עכשיו $' + Math.round(last).toLocaleString('en-US'), padL + 4, Y(last) - 5);
    x.strokeStyle = '#9aa6b8'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(padL, Y(last)); x.lineTo(W - padR, Y(last)); x.stroke(); x.setLineDash([]);
    // date labels (sparse)
    x.fillStyle = '#9aa6b8'; x.font = '10px Segoe UI'; x.textAlign = 'center';
    var step = Math.ceil(n / 9);
    data.forEach(function (c, i) { if (i % step === 0 || i === n - 1) x.fillText(fmtDate(c.t), X(i), H - 7); });
  }

  // ── מחולל מסלול-תרחיש סכמטי לפי וויקוף ──────────────────────────────────────
  // לוקח את הנרות האמיתיים האחרונים (ייחוס 4H) ובונה המשך סינתטי של המסלול הצפוי
  // לפי תאוריית וויקוף, עם ווליום תואם (שיא בשטיפה/קלימקס, התייבשות בטסט, פריצה,
  // No-Demand). מחזיר {candles, notes, divider}. real=[{o,h,l,c,v}].
  function buildPath(real, sc, kind) {
    var tail = real.slice(-5);
    var avgV = 0; tail.forEach(function (c) { avgV += c.v; }); avgV = (avgV / tail.length) || 1;
    var p0 = tail[tail.length - 1].c;
    var cs = tail.map(function (c) { return { o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, real: true }; });
    var divider = cs.length;
    var notes = [];
    function mk(open, close, hiW, loW, v) {
      var h = Math.max(open, close) + hiW, l = Math.min(open, close) - loW;
      cs.push({ o: open, h: h, l: l, c: close, v: v, real: false });
      return close;
    }
    function ramp(from, to, steps, vFrom, vTo) {
      var p = from;
      for (var i = 1; i <= steps; i++) {
        var nc = from + (to - from) * (i / steps);
        var w = Math.abs(nc - p) * 0.45;
        p = mk(p, nc, w, w, vFrom + (vTo - vFrom) * (i / steps));
      }
      return p;
    }
    var e = sc.entry, sl = sc.sl, t1 = sc.tp1, t2 = sc.tp2, t3 = sc.tp3 || sc.tp2;
    if (kind === 'long') {                       // ספרינג: דריפט→שטיפה→טסט→מארקאפ
      var sweep = sl + (e - sl) * 0.2, sup = e;
      var p = ramp(p0, sup * 1.004, 2, avgV * 0.7, avgV * 0.6);
      p = mk(p, sup, (sup - sweep) * 0.1, p - sweep, avgV * 2.6); notes.push({ i: cs.length - 1, t: 'שיא נפח (שטיפה)', c: '#cf9224', above: false });
      p = mk(p, sup * 1.004, sup * 0.002, sup * 0.001, avgV * 0.45); notes.push({ i: cs.length - 1, t: 'נפח מתייבש=אין היצע', c: '#2faa6a', above: false });
      p = mk(p, sup * 1.006, sup * 0.002, sup * 0.001, avgV * 0.4);
      ramp(p, e, 1, avgV * 0.7, avgV * 0.8); ramp(e, t1, 3, avgV * 0.9, avgV * 1.15); ramp(t1, t2, 3, avgV * 1.15, avgV * 1.3); ramp(t2, t3, 2, avgV * 1.3, avgV * 1.45);
    } else if (kind === 'break') {               // SOS: פריצה→BU→מארקאפ
      var res = e * 0.995;
      var p = ramp(p0, res, 2, avgV * 0.7, avgV * 0.8);
      p = mk(p, e, (e - res) * 0.4, (e - res) * 0.2, avgV * 2.3); notes.push({ i: cs.length - 1, t: 'נפח התפרצות 2x', c: '#2faa6a', above: true });
      p = mk(p, res * 1.002, res * 0.002, res * 0.003, avgV * 0.45); notes.push({ i: cs.length - 1, t: 'נפח נמוך BU', c: '#2faa6a', above: false });
      ramp(p, e, 1, avgV * 0.8, avgV * 0.95); ramp(e, t1, 3, avgV * 1.0, avgV * 1.2); ramp(t1, t2, 3, avgV * 1.2, avgV * 1.35); ramp(t2, t3, 2, avgV * 1.35, avgV * 1.5);
    } else {                                     // UTAD שורט: דחיפה→UTAD→LPSY→מארקדאון
      var resS = sl * 0.97;
      var p = ramp(p0, resS, 2, avgV * 0.7, avgV * 0.8);
      p = mk(p, resS * 0.997, (sl - resS) + sl * 0.004, resS * 0.002, avgV * 2.4); notes.push({ i: cs.length - 1, t: 'נפח גבוה UTAD', c: '#cf9224', above: true });
      p = mk(p, resS * 0.992, resS * 0.003, resS * 0.002, avgV * 0.4); notes.push({ i: cs.length - 1, t: 'נפח נמוך LPSY=אין ביקוש', c: '#e06a62', above: false });
      ramp(p, e, 1, avgV * 0.7, avgV * 0.85); ramp(e, t1, 3, avgV * 0.95, avgV * 1.1); ramp(t1, t2, 4, avgV * 1.1, avgV * 1.0);
    }
    return { candles: cs, notes: notes, divider: divider };
  }

  // ציור גרף תרחיש סכמטי (real|projected) + ווליום-תאוריה + רמות + תוויות
  function scenario(canvas, real, sc, M) {
    if (!canvas || !real || real.length < 2 || !sc) return;
    var path = buildPath(real, sc, sc.kind), data = path.candles;
    var x = canvas.getContext('2d'), W = canvas.width, H = canvas.height, padL = 60, padR = 70, padT = 14, volH = 78, gap = 8;
    var priceH = H - padT - volH - gap - 20;
    var levels = [
      { p: sc.entry, c: '#2faa6a', t: 'כניסה ' + M(sc.entry) },
      { p: sc.sl, c: '#e06a62', t: 'STOP ' + M(sc.sl) },
      { p: sc.tp1, c: '#4f7fd1', t: 'TP1 ' + M(sc.tp1) },
      { p: (sc.tp3 || sc.tp2), c: '#3a6fc4', t: 'יעד ' + M(sc.tp3 || sc.tp2) }
    ];
    var allL = data.map(function (c) { return c.l; }).concat(levels.map(function (v) { return v.p; }));
    var allH = data.map(function (c) { return c.h; }).concat(levels.map(function (v) { return v.p; }));
    var min = Math.min.apply(null, allL) * 0.997, max = Math.max.apply(null, allH) * 1.01;
    var maxV = Math.max.apply(null, data.map(function (c) { return c.v; })) || 1;
    var n = data.length, cw = (W - padL - padR) / n;
    function X(i) { return padL + cw * i + cw / 2; }
    function Y(p) { return padT + (max - p) / (max - min) * priceH; }
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#eef1f5'; x.fillStyle = '#7a8699'; x.font = '11px Segoe UI'; x.textAlign = 'right';
    for (var g = 0; g <= 4; g++) { var pp = min + (max - min) * g / 4, yy = Y(pp); x.beginPath(); x.moveTo(padL, yy); x.lineTo(W - padR, yy); x.stroke(); x.fillText('$' + (Math.round(pp / 100) / 10) + 'K', padL - 6, yy + 3); }
    // level lines + labels (right)
    levels.forEach(function (lv) {
      if (lv.p < min || lv.p > max) return;
      x.strokeStyle = lv.c; x.setLineDash([6, 3]); x.lineWidth = 1.2; x.beginPath(); x.moveTo(padL, Y(lv.p)); x.lineTo(W - padR, Y(lv.p)); x.stroke(); x.setLineDash([]);
      x.fillStyle = lv.c; x.font = 'bold 10px Segoe UI'; x.textAlign = 'left'; x.fillText(lv.t, W - padR + 3, Y(lv.p) + 3);
    });
    // divider real|projected
    var dx = padL + cw * path.divider;
    x.strokeStyle = '#b8c0cc'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(dx, padT); x.lineTo(dx, H - 20); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#9aa6b8'; x.font = '10px Segoe UI'; x.textAlign = 'center';
    x.fillText('אמיתי', dx - cw * 1.6, padT + priceH - 6); x.fillText('צפוי ◄', dx + cw * 2, padT + priceH - 6);
    // candles + volume
    data.forEach(function (c, i) {
      var up = c.c >= c.o, col = up ? '#2faa6a' : '#e06a62', cx = X(i), alpha = c.real ? 1 : 0.92;
      x.globalAlpha = alpha; x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1;
      x.beginPath(); x.moveTo(cx, Y(c.h)); x.lineTo(cx, Y(c.l)); x.stroke();
      var bw = Math.max(2, cw * 0.6); x.fillRect(cx - bw / 2, Math.min(Y(c.o), Y(c.c)), bw, Math.max(2, Math.abs(Y(c.c) - Y(c.o))));
      var vh = c.v / maxV * volH; x.globalAlpha = c.real ? 0.5 : 0.6; x.fillRect(cx - bw / 2, H - 20 - vh, bw, vh); x.globalAlpha = 1;
    });
    // notes (volume annotations)
    path.notes.forEach(function (nt) {
      var cx = X(nt.i), c = data[nt.i]; x.fillStyle = nt.c; x.font = 'bold 10px Segoe UI'; x.textAlign = 'center';
      var vy = H - 20 - (c.v / maxV * volH);
      x.fillText(nt.t, cx, nt.above ? Y(c.h) - 8 : vy - 6);
    });
    x.fillStyle = '#34425c'; x.font = 'bold 12px Segoe UI'; x.textAlign = 'center';
    x.fillText((sc.title || '').replace(/[🟢🔵🔴]/g, '').trim() + '  ·  R:R ≈ ' + sc.rr + '  ·  ' + (sc.tf || ''), W / 2, 12);
  }

  window.WyckoffChart = { draw: draw, scenario: scenario };
})();
