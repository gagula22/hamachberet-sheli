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

    x.fillStyle = '#0e1116'; x.fillRect(0, 0, W, H);
    // gridlines + price labels
    x.strokeStyle = '#1d2530'; x.fillStyle = '#7d8aa0'; x.font = '11px Segoe UI'; x.textAlign = 'right';
    for (var g = 0; g <= 4; g++) {
      var p = min + (max - min) * g / 4, yy = Y(p);
      x.beginPath(); x.moveTo(padL, yy); x.lineTo(W - padR, yy); x.stroke();
      x.fillText(kfmt(p), padL - 6, yy + 3);
    }
    // range lines
    if (opts.res != null) { x.setLineDash([5, 4]); x.strokeStyle = '#d2483b'; x.beginPath(); x.moveTo(padL, Y(opts.res)); x.lineTo(W - padR, Y(opts.res)); x.stroke(); }
    if (opts.sup != null) { x.setLineDash([5, 4]); x.strokeStyle = '#1f9d57'; x.beginPath(); x.moveTo(padL, Y(opts.sup)); x.lineTo(W - padR, Y(opts.sup)); x.stroke(); }
    x.setLineDash([]);
    // candles + volume
    data.forEach(function (c, i) {
      var up = c.c >= c.o, col = up ? '#26a269' : '#e0524a', cx = X(i);
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
        x.fillStyle = below ? '#e0b34a' : '#5aa9ff'; x.font = 'bold 12px Segoe UI'; x.textAlign = 'center';
        x.fillText(lab, cx, cy + (below ? 16 : -7));
        x.beginPath(); x.arc(cx, cy, 3, 0, 7); x.fill();
      });
    }
    // current price line
    var last = data[n - 1].c;
    x.fillStyle = '#e8eaed'; x.textAlign = 'left'; x.font = 'bold 11px Segoe UI';
    x.fillText('עכשיו $' + Math.round(last).toLocaleString('en-US'), padL + 4, Y(last) - 5);
    x.strokeStyle = '#e8eaed'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(padL, Y(last)); x.lineTo(W - padR, Y(last)); x.stroke(); x.setLineDash([]);
    // date labels (sparse)
    x.fillStyle = '#6b7688'; x.font = '10px Segoe UI'; x.textAlign = 'center';
    var step = Math.ceil(n / 9);
    data.forEach(function (c, i) { if (i % step === 0 || i === n - 1) x.fillText(fmtDate(c.t), X(i), H - 7); });
  }

  window.WyckoffChart = { draw: draw };
})();
