(function () {
  // PDF -> Word (EDITABLE). Builds on the heuristic line-reconstruction +
  // operator-list image extraction, and ADDS two things the old version
  // lacked: (1) text COLOR + HIGHLIGHT (background) colors, extracted by
  // walking the page operator list and correlating filled rectangles with
  // text bounding boxes, and (2) a hardened image decoder that correctly
  // handles 1bpp packed grayscale, RGB/RGBA, ImageBitmap (JPEG/DCT) and
  // stencil masks instead of scrambling them.
  //
  // It ALSO reconstructs FLOW LAYOUT (reflowable, fully editable — never
  // absolute boxes): per-paragraph ALIGNMENT (right/center/left/justify),
  // HEADING levels (font-size ratio), BOLD/ITALIC runs, and — crucially —
  // two-column / "label ...... value" rows become real Word TABLES so the
  // columns line up while the text stays editable. This is the pdf2docx /
  // Solid-Documents "reflowable" strategy expressed as MSO HTML, working
  // hand-in-hand with the Windows-1255 visual-Hebrew recovery (text is
  // recovered PER ITEM before any geometry is consumed, so column/alignment
  // math sees real Hebrew and logical RTL order = X descending).
  //
  // Output is a self-contained HTML document served as a Blob with MIME
  // 'application/msword' + UTF-8 BOM, downloaded as "<name>.doc". Word opens
  // it as a fully editable RTL document (text stays selectable/editable).
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    const base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
  }

  // ── Tool: PDF → Word ──────────────────────────────────────────────────────
  function buildPdfToWord() {
    const status = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const bar    = App.el('div', {
      style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px',
               width: '0', transition: 'width 300ms', marginTop: '10px' }
    });

    // Image extraction is the slow part of the conversion. The user can opt
    // out for a near-instant "text only" run.
    const imgCheckbox = document.createElement('input');
    imgCheckbox.type = 'checkbox';
    imgCheckbox.id = 'pdf2word-images';
    imgCheckbox.checked = true;
    imgCheckbox.style.cssText = 'margin:0;cursor:pointer;width:16px;height:16px;';
    const imgLabel = document.createElement('label');
    imgLabel.htmlFor = 'pdf2word-images';
    imgLabel.style.cssText = 'display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;user-select:none;';
    imgLabel.appendChild(imgCheckbox);
    var imgLabelText = document.createElement('span');
    imgLabelText.innerHTML = 'כלול תמונות מוטמעות <span style="color:var(--ink-mute);font-weight:400;">(איטי יותר ב־PDF גדולים)</span>';
    imgLabel.appendChild(imgLabelText);

    // ── Conversion mode: editable text vs. exact page-images ──────────────
    // Fundamental tradeoff: editable text can't perfectly reproduce the source
    // layout (it's reconstructed from glyph positions), while page-images are a
    // 100% faithful copy of the design but not editable. Let the user choose.
    function _modeRadio(value, checked, title, sub) {
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'pdf2word-mode'; r.value = value; r.checked = checked;
      r.style.cssText = 'margin:0;cursor:pointer;';
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--ink);cursor:pointer;user-select:none;';
      lbl.appendChild(r);
      const span = document.createElement('span');
      span.innerHTML = title + ' <span style="color:var(--ink-mute);font-weight:400;">' + sub + '</span>';
      lbl.appendChild(span);
      return lbl;
    }
    const modeEditable = _modeRadio('editable', true,  '📝 טקסט נערך', '(ניתן לעריכה · עיצוב מקורב)');
    const modeImage    = _modeRadio('image',    false, '🖼️ מראה מדויק כמו המקור', '(תמונות עמוד · עיצוב זהה · לא נערך)');
    function getMode() {
      var checked = document.querySelector('input[name="pdf2word-mode"]:checked');
      return checked ? checked.value : 'editable';
    }

    const optsRow = App.el('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start',
        marginTop: '12px', padding: '12px 14px',
        background: 'var(--cream)', borderRadius: 'var(--r-sm)',
        border: '1px solid var(--line)'
      }
    }, [modeEditable, modeImage]);

    // ── Helpers for structure-preserving extraction ──────────────────────
    function _escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _fontIsBold(name) {
      if (!name) return false;
      var n = String(name).toLowerCase();
      return /bold|black|heavy|semibold|demi/.test(n);
    }
    function _fontIsItalic(name) {
      if (!name) return false;
      var n = String(name).toLowerCase();
      return /italic|oblique/.test(n);
    }

    // ── Color helpers ────────────────────────────────────────────────────
    function _clamp255(v) { v = Math.round(v); return v < 0 ? 0 : (v > 255 ? 255 : v); }
    function _toHex(c) {
      return '#' + [c.r, c.g, c.b].map(function (v) {
        return _clamp255(v).toString(16).padStart(2, '0');
      }).join('');
    }
    // Perceptual luminance (0–255). Used to reject black text-fill and
    // white/near-white page background when picking highlight colors.
    function _lum(c) { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
    function _isNearBlack(c) { return _lum(c) < 30; }
    function _isNearWhite(c) { return c.r >= 248 && c.g >= 248 && c.b >= 248; }
    function _cmykToRgb(cc, m, y, k) {
      return {
        r: 255 * (1 - cc) * (1 - k),
        g: 255 * (1 - m) * (1 - k),
        b: 255 * (1 - y) * (1 - k)
      };
    }

    // ── Legacy Hebrew (Windows-1255 + visual order) recovery ─────────────
    // Many Hebrew PDFs embed fonts with NO Unicode (toUnicode) map and store
    // text VISUALLY (right-to-left already reversed). PDF.js then returns the
    // raw byte values, so each Hebrew letter (Win-1255 0xE0–0xFA) comes back as
    // the Latin-1 char at that code point — e.g. "לכבוד" → "ãåáëì" (gibberish).
    // This is NOT random gibberish: it is perfectly recoverable WITHOUT OCR.
    //   1) remap 0xE0–0xFA → Hebrew 0x05D0+(c−0xE0);
    //   2) the run is in visual order → reverse it to logical order, mirroring
    //      brackets () [] {} <> as we go;
    //   3) re-reverse embedded LTR runs (digits / Latin) so numbers like 1986
    //      and 01/12/22 read correctly again.
    var _MIRROR = { '(' : ')', ')' : '(', '[' : ']', ']' : '[', '{' : '}', '}' : '{', '<' : '>', '>' : '<' };
    var _HEB_RE = /[א-ת]/;
    function _remap1255(s) {
      var o = '';
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        o += (c >= 0xE0 && c <= 0xFA) ? String.fromCharCode(0x05D0 + (c - 0xE0)) : s[i];
      }
      return o;
    }
    function _fixVisualHebrew(str) {
      var f = _remap1255(str);
      if (!_HEB_RE.test(f)) return f;               // pure number/Latin item — leave as-is
      var r = f.split('').reverse().map(function (ch) { return _MIRROR[ch] || ch; }).join('');
      // restore internal order of digit / Latin runs reversed by the line flip
      return r.replace(/[0-9A-Za-z]+/g, function (m) { return m.split('').reverse().join(''); });
    }
    // Detect the legacy encoding: >50% of "letter" bytes fall in the Win-1255
    // Hebrew range (0xE0–0xFA). Real Unicode Hebrew (0x05D0+) and plain English
    // never trip this, so well-formed PDFs keep the normal extraction path.
    function _detectVisualHebrew(items) {
      var heb = 0, tot = 0;
      for (var i = 0; i < items.length; i++) {
        var s = items[i].str || '';
        for (var k = 0; k < s.length; k++) {
          var c = s.charCodeAt(k);
          if (c >= 0x41) { tot++; if (c >= 0xE0 && c <= 0xFA) heb++; }
        }
      }
      return tot > 20 && (heb / tot) > 0.5;
    }

    // Reconstruct lines from PDF text items by grouping items with similar
    // baseline Y. Within a line sort by X. PDF origin is bottom-left, so we
    // sort lines by Y descending afterwards. Each part also carries an
    // operator-order index (so we can align it with the color timeline) which
    // is filled in by the caller before calling this.
    //
    // `recoverHebrew` (optional): when true, each part's `str` is recovered
    // through _fixVisualHebrew up front, and the part is flagged visualHebrew
    // so downstream emitters keep RTL logical order (= X descending). All
    // geometry (x/width/fontSize/bold/italic) is encoding-independent, so the
    // SAME line model drives both the normal and the visual-Hebrew paths.
    function _buildLinesFromItems(items, recoverHebrew) {
      var lines = [];   // [{ y, h, parts: [...] }]
      const Y_TOLERANCE_FACTOR = 0.5;  // items within 0.5×height share a line
      items.forEach(function(it) {
        if (!it.str) return;
        // transform = [a, b, c, d, e, f]; e = x, f = y; height ≈ |a|
        var t = it.transform || [1,0,0,1,0,0];
        var x = t[4], y = t[5];
        var fontSize = Math.abs(t[0]) || it.height || 10;
        // width can be 0 for synthetic/visual fonts — estimate from glyph count
        // so gap/alignment math doesn't see every line as one giant token.
        var rawStr = it.str;
        var str = recoverHebrew ? _fixVisualHebrew(rawStr) : rawStr;
        var width = it.width || 0;
        if (!width && str) width = str.length * fontSize * 0.5;
        // synthetic-italic detection from transform shear (some embedded fonts
        // carry no "italic" in the name); also a fallback for bold via name.
        var shear = Math.abs(t[1]) + Math.abs(t[2]);
        var part = {
          str: str,
          x: x,
          y: y,
          fontSize: fontSize,
          bold: _fontIsBold(it.fontName),
          italic: _fontIsItalic(it.fontName) || (shear > 0.05 && Math.abs(t[0]) > 0),
          width: width,
          hasEOL: !!it.hasEOL,
          visualHebrew: !!recoverHebrew,
          // color/bg are assigned later from the operator-list correlation;
          // default to no color (black text) and no highlight.
          color: it.__color || null,   // {r,g,b} or null (=> black)
          bg: it.__bg || null          // {r,g,b} or null (=> no highlight)
        };
        var match = null;
        for (var j = lines.length - 1; j >= 0 && j >= lines.length - 6; j--) {
          var L = lines[j];
          var avgH = (L.h + fontSize) / 2;
          if (Math.abs(L.y - y) <= avgH * Y_TOLERANCE_FACTOR) { match = L; break; }
        }
        if (match) {
          match.parts.push(part);
          if (fontSize > match.h) match.h = fontSize;
        } else {
          lines.push({ y: y, h: fontSize, parts: [part] });
        }
      });
      lines.sort(function(a, b) { return b.y - a.y; });
      lines.forEach(function(L) {
        // Geometry order is ALWAYS X ascending; recovery already produced
        // logical RTL per item, and gap/column math works on physical X.
        // For RENDERING the visual-Hebrew line, the emitter re-sorts X
        // descending so logical RTL reading order is preserved.
        L.parts.sort(function(a, b) { return a.x - b.x; });
      });
      return lines;
    }

    // Body font size = MODE of rounded glyph sizes across the document (more
    // stable than the median when a page has many headings).
    function _bodyFontSize(lines) {
      var counts = {};
      var best = 0, bestN = 0, total = 0;
      lines.forEach(function(L) {
        L.parts.forEach(function(p) {
          if (p.fontSize > 0) {
            var r = Math.round(p.fontSize);
            counts[r] = (counts[r] || 0) + 1;
            total++;
            if (counts[r] > bestN) { bestN = counts[r]; best = r; }
          }
        });
      });
      if (!total) return 10;
      return best || 10;
    }

    // Convert a line's parts to inline HTML. Adjacent parts with identical
    // {bold,italic,color,bg} are merged into one run to minimize span churn
    // (huge PDFs otherwise explode the .doc and choke Word). A space is
    // inserted when there is a visible X gap between consecutive items.
    function _sameFmt(a, b) {
      function colEq(x, y) {
        if (!x && !y) return true;
        if (!x || !y) return false;
        return x.r === y.r && x.g === y.g && x.b === y.b;
      }
      return !!a.bold === !!b.bold && !!a.italic === !!b.italic &&
             colEq(a.color, b.color) && colEq(a.bg, b.bg);
    }

    // Strip dot-leaders / underscore fills (form leaders) from a run of text.
    function _stripLeaders(s) {
      return String(s).replace(/[.·․‥…_]{4,}/g, ' ').replace(/[ \t]{2,}/g, ' ');
    }

    // Render parts → inline HTML. `rtlOrder` reverses the gap/visual logic for
    // visual-Hebrew lines: parts are emitted X DESCENDING (logical RTL) and a
    // gap is measured on the RTL side.
    function _lineToHtml(parts, rtlOrder) {
      if (!parts.length) return '';
      var ordered = parts;
      if (rtlOrder) {
        ordered = parts.slice().sort(function(a, b) { return b.x - a.x; });
      }
      // Merge adjacent same-format runs, tracking gap-spaces between them.
      var runs = [];
      var prev = null;
      ordered.forEach(function(p) {
        var text = p.str;
        var leadSpace = '';
        if (prev) {
          var gap;
          if (rtlOrder) {
            // prev is to the RIGHT of p (larger x); gap = prev.x - (p.x+p.width)
            gap = prev.x - (p.x + (p.width || 0));
          } else {
            var prevEnd = prev.x + (prev.width || 0);
            gap = p.x - prevEnd;
          }
          if (gap > prev.fontSize * 0.25 && !/\s$/.test(prev.str) && !/^\s/.test(text)) {
            leadSpace = ' ';
          }
        }
        var last = runs.length ? runs[runs.length - 1] : null;
        if (last && _sameFmt(last.fmt, p)) {
          last.text += leadSpace + text;
        } else {
          runs.push({ fmt: { bold: p.bold, italic: p.italic, color: p.color, bg: p.bg },
                      text: (last ? leadSpace : '') + text });
        }
        prev = p;
      });

      var out = '';
      runs.forEach(function(run) {
        var text = _escHtml(run.text);
        var open = '', close = '';
        // Highlight background — wrap outermost so Word renders the fill.
        if (run.fmt.bg) {
          open += '<span style="background-color:' + _toHex(run.fmt.bg) + ';">';
          close = '</span>' + close;
        }
        // Text color — only emit for non-black fills.
        if (run.fmt.color && !_isNearBlack(run.fmt.color)) {
          open += '<span style="color:' + _toHex(run.fmt.color) + ';">';
          close = '</span>' + close;
        }
        if (run.fmt.bold)   { open += '<strong>'; close = '</strong>' + close; }
        if (run.fmt.italic) { open += '<em>';     close = '</em>' + close; }
        out += open + text + close;
      });
      return out;
    }

    // ── Per-line geometry helpers ────────────────────────────────────────
    function _lineLeft(L) {
      var m = Infinity;
      L.parts.forEach(function(p) { if (p.x < m) m = p.x; });
      return m;
    }
    function _lineRight(L) {
      var m = -Infinity;
      L.parts.forEach(function(p) { var e = p.x + (p.width || 0); if (e > m) m = e; });
      return m;
    }
    function _lineMaxSize(L) {
      var s = 0;
      L.parts.forEach(function(p) { if (p.fontSize > s) s = p.fontSize; });
      return s;
    }
    function _lineAllBold(L) {
      if (!L.parts.length) return false;
      return L.parts.every(function(p) { return p.bold || !/\S/.test(p.str); });
    }
    function _lineText(L) {
      return L.parts.map(function(p) { return p.str; }).join('');
    }

    // Heading level from font-size ratio, guarded so big *paragraphs* don't
    // become headings: require the line to be SHORT (< 0.8 of the block) OR
    // bold. Also promote narrow bold lines slightly larger than body to h3.
    function _lineTag(L, bodySize, blockW) {
      var maxSize = _lineMaxSize(L);
      var ratio = bodySize > 0 ? maxSize / bodySize : 1;
      var lineW = _lineRight(L) - _lineLeft(L);
      var shortLine = !blockW || lineW < blockW * 0.8;
      var bold = _lineAllBold(L);
      var headingOK = shortLine || bold;
      if (ratio >= 1.85 && headingOK) return 'h1';
      if (ratio >= 1.55 && headingOK) return 'h2';
      if (ratio >= 1.25 && headingOK) return 'h3';
      if (bold && ratio >= 1.12 && shortLine) return 'h3';  // Hebrew sub-headers
      return 'p';
    }

    // ── List detection (English + Hebrew) ────────────────────────────────
    var _BULLET_RE  = /^\s*([•·◦‣⁃●○▪▫■♦▶►–—\-*])\s+/;
    var _NUMBER_RE  = /^\s*(\d{1,3})[.)\]]\s+/;
    var _HEB_NUM_RE = /^\s*([א-ת])[.)\]]\s+/;

    function _detectListType(line) {
      if (!line.parts.length) return null;
      // For visual-Hebrew lines the logical-first token is the RIGHTMOST one.
      var firstStr = (line.parts[0].visualHebrew
        ? line.parts.slice().sort(function(a,b){ return b.x - a.x; })[0].str
        : line.parts[0].str) || '';
      if (_BULLET_RE.test(firstStr)) return 'ul';
      if (_NUMBER_RE.test(firstStr)) return 'ol';
      if (_HEB_NUM_RE.test(firstStr)) return 'ol';
      return null;
    }

    function _stripListMarker(line) {
      if (!line.parts.length) return line;
      var rtl = line.parts[0].visualHebrew;
      var newParts = line.parts.slice();
      var idx = 0;
      if (rtl) {
        // logical-first = rightmost; find its index in the (X-asc) array
        var maxX = -Infinity;
        newParts.forEach(function(p, i) { if (p.x > maxX) { maxX = p.x; idx = i; } });
      }
      var p0 = newParts[idx];
      var stripped = (p0.str || '').replace(_BULLET_RE, '')
                                   .replace(_NUMBER_RE, '')
                                   .replace(_HEB_NUM_RE, '');
      if (stripped === p0.str) return line;
      newParts[idx] = Object.assign({}, p0, { str: stripped });
      return Object.assign({}, line, { parts: newParts });
    }

    // ── Alignment detection vs the TEXT-BLOCK frame ──────────────────────
    // Returns 'right' | 'center' | 'left' | 'justify' | null (null = natural).
    // Uses the block frame (min/max X over all body lines) rather than the
    // physical page width, so a margined RTL body isn't mistaken for centered.
    function _classifyAlign(L, frame, bodySize, isLastLine, rtl) {
      var lineLeft = _lineLeft(L);
      var lineRight = _lineRight(L);
      if (!isFinite(lineLeft) || !isFinite(lineRight)) return null;
      var blockW = frame.right - frame.left;
      if (blockW <= 0) return null;
      var lineWidth = lineRight - lineLeft;
      var tol = Math.max(bodySize * 1.5, blockW * 0.04);
      var leftGap = lineLeft - frame.left;
      var rightGap = frame.right - lineRight;

      // CENTER: both edges inset by a similar amount, line not full-width.
      if (leftGap > tol && rightGap > tol &&
          Math.abs(leftGap - rightGap) < tol && lineWidth < blockW * 0.9) {
        return 'center';
      }
      if (rtl) {
        // RTL natural = hugs the RIGHT edge.
        if (rightGap <= tol) {
          // JUSTIFY: a non-last line that also fills the LEFT edge.
          if (!isLastLine && leftGap <= tol && lineWidth > blockW * 0.6) return 'justify';
          return 'right';
        }
        // pushed to the far LEFT inside an RTL doc
        if (leftGap <= tol && rightGap > 2 * tol) return 'left';
        return 'right';
      } else {
        if (leftGap <= tol) {
          if (!isLastLine && rightGap <= tol && lineWidth > blockW * 0.6) return 'justify';
          return 'left';
        }
        if (rightGap <= tol && leftGap > 2 * tol) return 'right';
        return 'left';
      }
    }

    // ── Column / "label : value" table detection ─────────────────────────
    // Split a line into cell fragments by wide X gaps and dot-leaders. Returns
    // [{ x0, x1, parts }] in geometry (X-ascending) order.
    function _splitLineCells(L, bodySize, pageWidth) {
      var parts = L.parts.slice().sort(function(a, b) { return a.x - b.x; });
      var fontSize = _lineMaxSize(L) || bodySize || 10;
      var gapThresh = Math.max(2.5 * fontSize * 0.25 * 1, fontSize * 1.6, pageWidth * 0.06);
      var cells = [];
      var cur = null;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var isLeader = /[.·․‥…_]{4,}/.test(p.str || '');
        if (cur) {
          var gap = p.x - (cur.x1);
          if (gap > gapThresh || isLeader) {
            cells.push(cur);
            cur = null;
          }
        }
        if (isLeader) {
          // leader part is the separator itself; don't start a cell from it
          continue;
        }
        if (!cur) {
          cur = { x0: p.x, x1: p.x + (p.width || 0), parts: [p] };
        } else {
          cur.parts.push(p);
          var e = p.x + (p.width || 0);
          if (e > cur.x1) cur.x1 = e;
        }
      }
      if (cur) cells.push(cur);
      return cells;
    }

    // Cluster 1-D X positions into column centers (sort + merge).
    function _clusterX(positions, tol) {
      var sorted = positions.slice().sort(function(a, b) { return a - b; });
      var clusters = [];
      sorted.forEach(function(x) {
        var last = clusters.length ? clusters[clusters.length - 1] : null;
        if (last && (x - last.sum / last.n) <= tol) {
          last.sum += x; last.n += 1;
        } else {
          clusters.push({ sum: x, n: 1 });
        }
      });
      return clusters.map(function(c) { return c.sum / c.n; });
    }

    // Given a group of consecutive candidate rows (each = {L, cells}), build a
    // global column grid and emit a Word table, or return null if not a
    // confident table. RTL emits columns rightmost-first (logical order).
    function _buildTableHtml(rows, bodySize, pageWidth, rtl, rects, frame) {
      if (rows.length < 2) return null;
      // collect cell left-edge centers across all rows
      var lefts = [];
      rows.forEach(function(r) { r.cells.forEach(function(c) { lefts.push(c.x0); }); });
      var tol = Math.max(bodySize * 1.2, pageWidth * 0.03);
      var centers = _clusterX(lefts, tol);
      if (centers.length < 2) return null;

      // A column is "stable" if it receives a fragment in >=60% of rows.
      function nearestCol(x) {
        var bi = 0, bd = Infinity;
        for (var i = 0; i < centers.length; i++) {
          var d = Math.abs(x - centers[i]);
          if (d < bd) { bd = d; bi = i; }
        }
        return bi;
      }
      var hits = centers.map(function() { return 0; });
      rows.forEach(function(r) {
        var seen = {};
        r.cells.forEach(function(c) { seen[nearestCol(c.x0)] = true; });
        Object.keys(seen).forEach(function(ci) { hits[ci]++; });
      });
      var stableIdx = [];
      for (var i = 0; i < centers.length; i++) {
        if (hits[i] >= rows.length * 0.6) stableIdx.push(i);
      }
      if (stableIdx.length < 2) return null;

      // Re-map centers to only stable columns.
      var stableCenters = stableIdx.map(function(i) { return centers[i]; });
      function nearestStable(x) {
        var bi = 0, bd = Infinity;
        for (var i = 0; i < stableCenters.length; i++) {
          var d = Math.abs(x - stableCenters[i]);
          if (d < bd) { bd = d; bi = i; }
        }
        return bi;
      }

      // column order for output: RTL → rightmost source column first.
      var order = stableCenters.map(function(_, i) { return i; });
      if (rtl) order = order.slice().reverse();

      // column widths (% of frame) from gaps between stable centers.
      var blockW = (frame.right - frame.left) || pageWidth || 1;
      var bounds = stableCenters.slice();
      bounds.push(frame.right);                  // right edge of last column span
      var widths = [];
      for (var ci = 0; ci < stableCenters.length; ci++) {
        var w = (bounds[ci + 1] - stableCenters[ci]);
        widths.push(Math.max(5, Math.round((w / blockW) * 100)));
      }

      // LATTICE vs STREAM: look for ruling rectangles spanning row width.
      var lattice = false;
      if (rects && rects.length) {
        var yTop = -Infinity, yBot = Infinity;
        rows.forEach(function(r) {
          if (r.L.y > yTop) yTop = r.L.y;
          if (r.L.y < yBot) yBot = r.L.y;
        });
        for (var rr = 0; rr < rects.length && !lattice; rr++) {
          var R = rects[rr];
          var rw = R.x1 - R.x0, rh = R.y1 - R.y0;
          // thin wide horizontal rule, or a tall thin vertical rule near grid
          if ((rh <= 3 && rw > blockW * 0.4) || (rw <= 3 && rh > (yTop - yBot) * 0.4)) {
            lattice = true;
          }
        }
      }

      var border = lattice ? '1px solid #000' : 'none';
      var html = '<table dir="' + (rtl ? 'rtl' : 'ltr') + '" border="' + (lattice ? '1' : '0') +
        '" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:fixed;' +
        (rtl ? 'mso-table-dir:bidi;direction:rtl;' : 'direction:ltr;') + '">';

      rows.forEach(function(r, ri) {
        // assign fragments to stable columns
        var byCol = stableCenters.map(function() { return null; });
        r.cells.forEach(function(c) {
          var idx = nearestStable(c.x0);
          if (!byCol[idx]) byCol[idx] = c.parts.slice();
          else byCol[idx] = byCol[idx].concat(c.parts);
        });
        html += '<tr>';
        order.forEach(function(colIdx, outI) {
          var frag = byCol[colIdx];
          var widthAttr = (ri === 0) ? (' width="' + widths[colIdx] + '%"') : '';
          var cellStyle = 'padding:2px 6px;border:' + border + ';vertical-align:top;' +
            (rtl ? 'direction:rtl;text-align:right;' : 'text-align:left;') +
            'unicode-bidi:plaintext;width:' + widths[colIdx] + '%;';
          var inner;
          if (frag && frag.length) {
            inner = _lineToHtml(frag, rtl);
            inner = _stripLeaders(inner);
          } else {
            inner = '&nbsp;';
          }
          if (!inner || !inner.replace(/&nbsp;|\s/g, '')) inner = '&nbsp;';
          html += '<td' + widthAttr + ' style="' + cellStyle + '">' + inner + '</td>';
        });
        html += '</tr>';
      });
      html += '</table>';
      return html;
    }

    // ── Matrix multiply (CTM tracking) ───────────────────────────────────
    function _matMul(m1, m2) {
      return [
        m1[0]*m2[0] + m1[2]*m2[1],
        m1[1]*m2[0] + m1[3]*m2[1],
        m1[0]*m2[2] + m1[2]*m2[3],
        m1[1]*m2[2] + m1[3]*m2[3],
        m1[0]*m2[4] + m1[2]*m2[5] + m1[4],
        m1[1]*m2[4] + m1[3]*m2[5] + m1[5]
      ];
    }
    // Apply a CTM to a point in user space → device/page space.
    function _applyMat(m, x, y) {
      return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] };
    }

    // ── Hardened image decoder ───────────────────────────────────────────
    // Fixes the old "broken images" complaint. The old code decoded
    // kind===1 (GRAYSCALE_1BPP) as 8-bit grayscale — but kind 1 is ONE BIT
    // per pixel, packed 8px/byte with each row padded to a whole byte. It
    // also never tried img.bitmap first, so JPEG/DCT images (which arrive as
    // an ImageBitmap, NOT as .data) silently vanished.
    function _imgObjToDataUrl(img) {
      if (!img || !img.width || !img.height) return null;
      // Skip decorative tiny images (icons / masks / dots).
      if (img.width < 8 || img.height < 8) return null;
      try {
        var w = img.width, h = img.height;
        var srcCanvas = document.createElement('canvas');
        srcCanvas.width = w;
        srcCanvas.height = h;
        var srcCtx = srcCanvas.getContext('2d');

        if (img.bitmap) {
          // (1) ImageBitmap / canvas — the common case for JPEG/DCT images
          // decoded by the worker. ALWAYS try this first.
          srcCtx.drawImage(img.bitmap, 0, 0, w, h);
        } else if (img.data) {
          var imgData = srcCtx.createImageData(w, h);
          var dst = imgData.data;
          var src = img.data;
          var kind = img.kind;

          if (kind === 3) {
            // RGBA_32BPP — straight copy.
            var min = Math.min(src.length, dst.length);
            for (var i3 = 0; i3 < min; i3++) dst[i3] = src[i3];
          } else if (kind === 2) {
            // RGB_24BPP. Compute the actual row stride to survive row
            // padding (never assume contiguous width*3).
            var rowBytes2 = w * 3;
            if (src.length > rowBytes2 * h) {
              rowBytes2 = Math.floor(src.length / h);
            }
            for (var y2 = 0; y2 < h; y2++) {
              var sRow = y2 * rowBytes2;
              var dRow = y2 * w * 4;
              for (var x2 = 0; x2 < w; x2++) {
                var so = sRow + x2 * 3;
                var doff = dRow + x2 * 4;
                dst[doff]   = src[so];
                dst[doff+1] = src[so+1];
                dst[doff+2] = src[so+2];
                dst[doff+3] = 255;
              }
            }
          } else if (kind === 1) {
            // GRAYSCALE_1BPP — THE FIX. 1 bit per pixel, packed 8px/byte,
            // each row padded to a whole byte. bit set = white.
            var bytesPerRow = (w + 7) >> 3;
            for (var y1 = 0; y1 < h; y1++) {
              var rowOff = y1 * bytesPerRow;
              for (var x1 = 0; x1 < w; x1++) {
                var byteIdx = rowOff + (x1 >> 3);
                var bit = (src[byteIdx] >> (7 - (x1 & 7))) & 1;
                var v = bit ? 255 : 0;
                var d1 = (y1 * w + x1) * 4;
                dst[d1] = dst[d1+1] = dst[d1+2] = v;
                dst[d1+3] = 255;
              }
            }
          } else {
            // No explicit kind. If the data length matches a 1bpp stencil
            // (ceil(w/8)*h) treat it as a mask: opaque black where bit set.
            var bpr = (w + 7) >> 3;
            if (src.length >= bpr * h) {
              for (var ym = 0; ym < h; ym++) {
                var rOff = ym * bpr;
                for (var xm = 0; xm < w; xm++) {
                  var bI = rOff + (xm >> 3);
                  var b = (src[bI] >> (7 - (xm & 7))) & 1;
                  var dm = (ym * w + xm) * 4;
                  // stencil: bit set => opaque black, else transparent.
                  dst[dm] = dst[dm+1] = dst[dm+2] = 0;
                  dst[dm+3] = b ? 255 : 0;
                }
              }
            } else {
              // Unknown/short data — never emit a scrambled canvas.
              return null;
            }
          }
          srcCtx.putImageData(imgData, 0, 0);
        } else {
          return null;
        }

        // Validate the canvas isn't fully blank/transparent (sample a few
        // pixels). A fully-empty canvas means decoding failed.
        try {
          var sample = srcCtx.getImageData(0, 0, Math.min(w, 4), Math.min(h, 4)).data;
          var anyNonZero = false;
          for (var s = 3; s < sample.length; s += 4) {
            if (sample[s] !== 0) { anyNonZero = true; break; }
          }
          if (!anyNonZero) return null;
        } catch (e) { /* CORS-tainted bitmaps can't be sampled; allow them. */ }

        // Downscale to max edge 1280 before serializing.
        var MAX_EDGE = 1280;
        var canvas = srcCanvas;
        if (w > MAX_EDGE || h > MAX_EDGE) {
          var scale = MAX_EDGE / Math.max(w, h);
          var dw = Math.round(w * scale);
          var dh = Math.round(h * scale);
          canvas = document.createElement('canvas');
          canvas.width = dw;
          canvas.height = dh;
          canvas.getContext('2d').drawImage(srcCanvas, 0, 0, dw, dh);
        }
        // Photos (>512 either side) → JPEG; line art / text-in-image → PNG.
        var useJpeg = (canvas.width > 512 || canvas.height > 512);
        return useJpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('[pdf2word] image decode failed:', e);
        return null;
      }
    }

    function _resolvePageObj(page, objId) {
      return new Promise(function(resolve) {
        // An image XObject can live in page.objs (page-local) OR page.commonObjs
        // (global — its id starts with "g_"). Critically, some images are only
        // sent to the main thread when the page is RENDERED; from getOperatorList
        // alone their resolve-callback may NEVER fire. So we (a) check BOTH stores
        // synchronously, (b) register a callback on BOTH, and (c) keep a SHORT
        // safety timeout — if the object never arrives we skip that one image
        // (resolve null) instead of freezing the whole conversion forever.
        var settled = false;
        var done = function(obj) { if (!settled) { settled = true; resolve(obj); } };
        setTimeout(function () { done(null); }, 2500);
        var stores = [page.commonObjs, page.objs];
        try {
          for (var s = 0; s < stores.length; s++) {
            var store = stores[s];
            if (store && store.has && store.has(objId)) { done(store.get(objId)); return; }
          }
          // Not available yet — register on both; whichever holds it fires first.
          for (var s2 = 0; s2 < stores.length; s2++) {
            (function (store) {
              if (!store || !store.get) return;
              try { store.get(objId, function (obj) { done(obj); }); } catch (e) { /* wrong store */ }
            })(stores[s2]);
          }
        } catch (e) { done(null); }
      });
    }

    // ── Operator-list pass: images + colors + highlight rectangles ───────
    // This is the load-bearing addition. We walk the page operator list once,
    // tracking the CTM via the save/restore stack and OPS.transform, and the
    // current fill color. We collect:
    //   • image references (objId + CTM), exactly like the old Phase 1;
    //   • FILLED RECTANGLES drawn before text (candidate highlights), in
    //     device space, with their fill color;
    //   • a "color timeline": one fill-color snapshot per showText op, in op
    //     order — getTextContent items map (approximately) 1:1 to these.
    function _walkOperatorList(opList, page) {
      var OPS = pdfjsLib.OPS;
      var ctm = [1,0,0,1,0,0];
      var stack = [];
      var fill = { r: 0, g: 0, b: 0 };   // current fill color, default black

      var refs = [];        // [{ objId, ctm }]
      var rects = [];       // [{ x0,y0,x1,y1, color, order }] filled rects
      var colorTimeline = []; // [{r,g,b}] one per showText, in op order
      // Remember the most recently constructed path so we can recognise a
      // rectangle that is immediately filled.
      var pendingRect = null; // {x0,y0,x1,y1} in device space, or null

      var fnArray = opList.fnArray, argsArray = opList.argsArray;
      for (var i = 0; i < fnArray.length; i++) {
        var op = fnArray[i];
        var args = argsArray[i];

        if (op === OPS.save) {
          stack.push({ ctm: ctm.slice(), fill: { r: fill.r, g: fill.g, b: fill.b } });
        } else if (op === OPS.restore) {
          if (stack.length) { var st = stack.pop(); ctm = st.ctm; fill = st.fill; }
        } else if (op === OPS.transform) {
          ctm = _matMul(ctm, args);

        // ── Fill color tracking ──────────────────────────────────────────
        } else if (op === OPS.setFillRGBColor) {
          // op-list args are already 0–255 integers — do NOT ×255.
          fill = { r: args[0], g: args[1], b: args[2] };
        } else if (op === OPS.setFillGray) {
          var gv = Math.round((args[0] || 0) * 255); // gray is 0–1
          fill = { r: gv, g: gv, b: gv };
        } else if (op === OPS.setFillCMYKColor) {
          fill = _cmykToRgb(args[0] || 0, args[1] || 0, args[2] || 0, args[3] || 0);
        } else if (op === OPS.setFillColor || op === OPS.setFillColorN) {
          // Generic — may carry [r,g,b] (0–1 or 0–255). Guard array shape.
          if (args && args.length >= 3 && typeof args[0] === 'number') {
            var mx = Math.max(args[0], args[1], args[2]);
            var mul = mx <= 1 ? 255 : 1;
            fill = { r: args[0]*mul, g: args[1]*mul, b: args[2]*mul };
          }

        // ── Rectangle path → candidate highlight ─────────────────────────
        } else if (op === OPS.constructPath) {
          // In 3.x args = [subOpsArray, coordsArray(, minMax)]. A rectangle
          // sub-op (OPS.rectangle === 19) carries flat coords [x,y,w,h].
          pendingRect = null;
          try {
            var subOps = args[0], coords = args[1];
            if (subOps && coords && typeof subOps.length === 'number') {
              for (var so = 0, ci = 0; so < subOps.length; so++) {
                var sub = subOps[so];
                if (sub === OPS.rectangle) {
                  var rx = coords[ci], ry = coords[ci+1], rw = coords[ci+2], rh = coords[ci+3];
                  // Transform the 4 corners by the CTM into device space.
                  var c1 = _applyMat(ctm, rx, ry);
                  var c2 = _applyMat(ctm, rx + rw, ry + rh);
                  pendingRect = {
                    x0: Math.min(c1.x, c2.x), y0: Math.min(c1.y, c2.y),
                    x1: Math.max(c1.x, c2.x), y1: Math.max(c1.y, c2.y)
                  };
                  ci += 4;
                } else if (sub === OPS.moveTo || sub === OPS.lineTo) {
                  ci += 2;
                } else if (sub === OPS.curveTo) {
                  ci += 6;
                } else if (sub === OPS.curveTo2 || sub === OPS.curveTo3) {
                  ci += 4;
                }
              }
            }
          } catch (e) { pendingRect = null; }

        } else if (op === OPS.fill || op === OPS.eoFill) {
          // A fill right after a rectangle path = a filled rectangle. Record it
          // as a highlight candidate — but PRE-FILTER hard. Chart PDFs are built
          // from thousands of tiny colored rectangles (every candlestick = a
          // rect); collecting them all and correlating each against every text
          // item is O(items×rects) and freezes the tab. A real text highlight is
          // (a) reasonably wide and tall (spans a word/line), and (b) a non-black,
          // non-white fill. Thin/tiny rects (candles, wicks, rules) and pure
          // black/white fills are dropped at the source. We also cap the total.
          //
          // EXCEPTION: a thin WIDE rect is a table ruling line — keep it (it's
          // the lattice-table signal) even though it's not a highlight.
          if (pendingRect && rects.length < 2500) {
            var rW = pendingRect.x1 - pendingRect.x0;
            var rH = pendingRect.y1 - pendingRect.y0;
            var rLum = 0.299 * fill.r + 0.587 * fill.g + 0.114 * fill.b;
            var isRule = (rH <= 3 && rW >= 30) || (rW <= 3 && rH >= 12);
            if (isRule ||
                (rW >= 8 && rH >= 4 && rLum >= 30 && rLum <= 245 &&
                 !(fill.r >= 248 && fill.g >= 248 && fill.b >= 248))) {
              rects.push({
                x0: pendingRect.x0, y0: pendingRect.y0, x1: pendingRect.x1, y1: pendingRect.y1,
                color: { r: fill.r, g: fill.g, b: fill.b }, order: i, rule: isRule
              });
            }
          }
          pendingRect = null;

        // ── Text — snapshot pen color into the timeline ──────────────────
        } else if (op === OPS.showText || op === OPS.showSpacedText) {
          colorTimeline.push({ r: fill.r, g: fill.g, b: fill.b, order: i });

        // ── Images ───────────────────────────────────────────────────────
        } else if (op === OPS.paintImageXObject || op === OPS.paintImageMaskXObject ||
                   op === OPS.paintInlineImageXObject) {
          // paintInlineImageXObject carries the image object inline as args[0]
          // (not an objId string); _resolveImages decodes string ids, and for
          // inline objects we decode directly here.
          if (typeof args[0] === 'string') {
            refs.push({ objId: args[0], ctm: ctm.slice() });
          } else if (args[0] && args[0].width) {
            refs.push({ inlineImg: args[0], ctm: ctm.slice() });
          }
        }
      }
      return { refs: refs, rects: rects, colorTimeline: colorTimeline };
    }

    // Resolve + decode the unique images collected from the operator walk.
    async function _resolveImages(page, refs) {
      if (!refs.length) return [];
      var uniqueIds = {};
      refs.forEach(function(r) { if (typeof r.objId === 'string') uniqueIds[r.objId] = true; });
      var idList = Object.keys(uniqueIds);
      var resolvedById = {};
      await Promise.all(idList.map(async function(objId) {
        try {
          var imgObj = await _resolvePageObj(page, objId);
          if (!imgObj) return;
          var dataUrl = _imgObjToDataUrl(imgObj);
          if (dataUrl) resolvedById[objId] = dataUrl;
        } catch (e) { /* one bad image must not kill the page */ }
      }));
      var images = [];
      for (var k = 0; k < refs.length; k++) {
        var r = refs[k];
        var url = null;
        if (typeof r.objId === 'string') {
          url = resolvedById[r.objId];
        } else if (r.inlineImg) {
          // Inline image object — decode directly (no objs lookup).
          try { url = _imgObjToDataUrl(r.inlineImg); } catch (e) { url = null; }
        }
        if (!url) continue;
        images.push({
          x: r.ctm[4],
          y: r.ctm[5],
          width: Math.abs(r.ctm[0]),
          height: Math.abs(r.ctm[3]),
          dataUrl: url
        });
      }
      return images;
    }

    // ── Correlate colors + highlight rects with text items ───────────────
    // Mutates each item, stamping it with __color (text fill) and __bg
    // (highlight background) which _buildLinesFromItems then reads.
    function _correlate(items, walk, pageWidth, pageHeight) {
      var timeline = walk.colorTimeline;
      var rects = walk.rects;
      var sameLen = timeline.length === items.length;

      // Build device-space bbox for a text item from its transform.
      function bboxOf(it) {
        var t = it.transform || [1,0,0,1,0,0];
        var x = t[4], y = t[5];
        var fh = Math.abs(t[0]) || it.height || 10;       // glyph/line height
        var wdt = it.width || (it.str ? it.str.length * fh * 0.5 : fh);
        // baseline at y; expand downward ~0.25h for descenders, up by ~0.8h
        // for the cap height so the box covers the glyph body.
        return { x0: x, y0: y - fh * 0.25, x1: x + wdt, y1: y + fh * 0.8, h: fh, wdt: wdt };
      }

      items.forEach(function(it, k) {
        var bb = bboxOf(it);

        // ── Text color ──
        var col = null;
        if (sameLen) {
          col = timeline[k];
        } else if (timeline.length) {
          var idx = Math.min(timeline.length - 1, Math.floor(k * timeline.length / Math.max(1, items.length)));
          col = timeline[idx];
        }
        if (col && !_isNearBlack(col)) {
          it.__color = { r: col.r, g: col.g, b: col.b };
        }
        var showOrder = (col && typeof col.order === 'number') ? col.order : Infinity;

        // ── Highlight background ──
        var textArea = Math.max(1, (bb.x1 - bb.x0) * (bb.y1 - bb.y0));
        var best = null, bestArea = Infinity;
        for (var ri = 0; ri < rects.length; ri++) {
          var R = rects[ri];
          if (R.rule) continue;                 // ruling lines are not highlights
          if (R.order >= showOrder) continue;
          var lum = _lum(R.color);
          if (lum < 30 || lum > 245) continue;
          if (_isNearWhite(R.color)) continue;
          var rw = R.x1 - R.x0, rh = R.y1 - R.y0;
          if (rw <= 0 || rh <= 0) continue;
          if (pageWidth && pageHeight && rw > pageWidth * 0.7 && rh > pageHeight * 0.5) continue;
          if (rh > bb.h * 2.2) continue;
          var ox = Math.max(0, Math.min(bb.x1, R.x1) - Math.max(bb.x0, R.x0));
          var oy = Math.max(0, Math.min(bb.y1, R.y1) - Math.max(bb.y0, R.y0));
          var overlap = ox * oy;
          if (overlap / textArea < 0.55) continue;
          var area = rw * rh;
          if (area < bestArea) { best = R; bestArea = area; }
        }
        if (best) it.__bg = { r: best.color.r, g: best.color.g, b: best.color.b };
      });
      return items;
    }

    // ── Compute the text-block frame (min/max X over body lines) ──────────
    function _blockFrame(lines, bodySize) {
      var left = Infinity, right = -Infinity;
      lines.forEach(function(L) {
        var l = _lineLeft(L), r = _lineRight(L);
        if (isFinite(l) && l < left) left = l;
        if (isFinite(r) && r > right) right = r;
      });
      if (!isFinite(left) || !isFinite(right)) { left = 0; right = 0; }
      return { left: left, right: right };
    }

    // ── Unified page emitter (flow + alignment + headings + tables) ───────
    // `rtl` true for visual-Hebrew pages (logical RTL = X descending). The
    // SAME pipeline drives both paths; the only differences are the RTL flag,
    // run ordering, and default paragraph direction.
    function _emitPage(lines, images, bodySize, pageWidth, rtl, rects) {
      var frame = _blockFrame(lines, bodySize);
      var blockW = (frame.right - frame.left) || pageWidth || 1;

      // Pre-classify each line: tag (p/h*), align, list type, cells.
      var lineInfos = lines.map(function(L, i) {
        var listType = _detectListType(L);
        var tag = listType ? 'p' : _lineTag(L, bodySize, blockW);
        var cells = (tag === 'p' && !listType) ? _splitLineCells(L, bodySize, pageWidth) : [];
        return { L: L, tag: tag, listType: listType, cells: cells };
      });

      // Decide "last line of paragraph" for justify: a line is last if the
      // next line starts a big vertical gap, has a different tag, or is a list.
      function isLastOfPara(idx) {
        if (idx >= lineInfos.length - 1) return true;
        var cur = lineInfos[idx], nxt = lineInfos[idx + 1];
        if (nxt.listType || nxt.tag !== cur.tag) return true;
        var gap = cur.L.y - nxt.L.y;
        var h = cur.L.h || bodySize;
        return gap > h * 1.4;
      }

      // Build draw blocks interleaved with images by Y.
      var blocks = [];
      (images || []).forEach(function(im) {
        blocks.push({ kind: 'image', y: im.y + im.height, image: im });
      });
      lineInfos.forEach(function(info, i) {
        blocks.push({ kind: 'line', y: info.L.y, info: info, idx: i });
      });
      blocks.sort(function(a, b) { return b.y - a.y; });

      var html = '';
      var openTag = null, openParts = [], openAlign = null;
      var listType = null, listItems = [];
      var prevY = null, prevH = bodySize;

      function alignStyle(a) {
        if (a === 'center') return 'text-align:center;';
        if (a === 'justify') return 'text-align:justify;text-justify:inter-word;';
        if (a === 'left') return 'text-align:left;';
        if (a === 'right') return 'text-align:right;';
        return '';
      }

      function flushPara() {
        if (!openTag || !openParts.length) { openTag = null; openParts = []; openAlign = null; return; }
        var inner = openParts.join('<br>');
        var style = 'unicode-bidi:plaintext;direction:' + (rtl ? 'rtl' : 'auto') + ';margin:0 0 8px;';
        if (openTag === 'p') style += 'line-height:1.7;';
        style += alignStyle(openAlign);
        var dirAttr = rtl ? ' dir="rtl"' : '';
        html += '<' + openTag + dirAttr + ' style="' + style + '">' + inner + '</' + openTag + '>';
        openTag = null; openParts = []; openAlign = null;
      }
      function flushList() {
        if (!listType || !listItems.length) { listType = null; listItems = []; return; }
        var lis = listItems.map(function(it) {
          return '<li style="unicode-bidi:plaintext;direction:' + (rtl ? 'rtl' : 'auto') +
            ';line-height:1.7;margin-bottom:4px;">' + it + '</li>';
        }).join('');
        var listStyle = 'margin:8px 0;' + (rtl ? 'padding-right:28px;padding-left:0;' : 'padding-left:28px;padding-right:0;');
        html += '<' + listType + ' style="' + listStyle + '">' + lis + '</' + listType + '>';
        listType = null; listItems = [];
      }
      function flushAll() { flushPara(); flushList(); }

      // We process line-blocks in document Y order, but TABLE detection needs
      // to look ahead over consecutive multi-cell rows. So pre-scan the Y-sorted
      // line blocks to mark table groups.
      var lineBlocks = blocks.filter(function(b) { return b.kind === 'line'; });
      // assign a stable key to each line block so tableGroupOf can reference it
      lineBlocks.forEach(function(b, i) { b._k = i; });
      var tableGroupOf = {};   // block key → group id
      var tableRows = {};      // gid -> [{L, cells}]
      (function detectTables() {
        var gid = 0, i = 0;
        while (i < lineBlocks.length) {
          var info = lineBlocks[i].info;
          var isRow = info.tag === 'p' && !info.listType && info.cells.length >= 2;
          if (!isRow) { i++; continue; }
          var j = i, group = [];
          while (j < lineBlocks.length) {
            var inf = lineBlocks[j].info;
            if (!(inf.tag === 'p' && !inf.listType && inf.cells.length >= 2)) break;
            group.push(lineBlocks[j]);
            j++;
          }
          if (group.length >= 2) {
            gid++;
            tableRows[gid] = group.map(function(b) { return { L: b.info.L, cells: b.info.cells }; });
            group.forEach(function(b) { tableGroupOf[b._k] = gid; });
          }
          i = j > i ? j : i + 1;
        }
      })();
      var emittedGroup = {};

      blocks.forEach(function(b) {
        if (b.kind === 'image') {
          flushAll();
          var im = b.image;
          var dispW = im.width ? Math.min(680, Math.round(im.width)) : 480;
          // Word reliably renders a data-URL image only when it is wrapped in a
          // <table> and carries explicit px width AND height attributes — this is
          // the exact structure the notebook Word export uses (confirmed working).
          // A bare <img> with a CSS width shows as an empty bordered box in Word.
          var dispH = (im.width && im.height) ? Math.round(dispW * im.height / im.width) : 0;
          html += '<table border="0" cellpadding="0" cellspacing="0" align="center" width="100%" ' +
                  'style="border-collapse:collapse;margin:10px 0;page-break-inside:avoid;mso-pagination:widow-orphan keep-together;">' +
                  '<tr><td align="center" style="text-align:center;padding:6px 0;">' +
                  '<img width="' + dispW + '"' + (dispH > 0 ? ' height="' + dispH + '"' : '') +
                  ' src="' + im.dataUrl + '" style="display:block;margin:0 auto;" /></td></tr></table>';
          prevY = im.y; prevH = im.height;
          return;
        }

        var info = b.info;
        var L = info.L;

        // ── Table group? emit the whole table once, then skip its rows ──
        var gid = tableGroupOf[b._k];
        if (gid) {
          if (emittedGroup[gid]) { prevY = L.y; prevH = L.h; return; }
          var tHtml = _buildTableHtml(tableRows[gid], bodySize, pageWidth, rtl, rects, frame);
          if (tHtml) {
            flushAll();
            html += tHtml;
            emittedGroup[gid] = true;
            tableRows[gid].forEach(function(r) { if (prevY === null || r.L.y < prevY) prevY = r.L.y; });
            prevH = L.h;
            return;
          }
          // table not confident → fall through as ordinary paragraphs
          emittedGroup[gid] = 'fallback';
        }

        // ── List item ──
        if (info.listType) {
          flushPara();
          var stripped = _stripListMarker(L);
          var liHtml = _lineToHtml(stripped.parts, rtl);
          if (!liHtml.trim()) { prevY = L.y; prevH = L.h; return; }
          if (listType === info.listType) {
            listItems.push(liHtml);
          } else {
            flushList();
            listType = info.listType;
            listItems = [liHtml];
          }
          prevY = L.y; prevH = L.h;
          return;
        }

        // continuation of a list paragraph spanning lines
        if (listType && listItems.length) {
          if (prevY !== null && (prevY - L.y) < prevH * 1.6) {
            var contHtml = _lineToHtml(L.parts, rtl);
            if (contHtml.trim()) {
              listItems[listItems.length - 1] += ' ' + contHtml;
              prevY = L.y; prevH = L.h;
              return;
            }
          }
          flushList();
        }

        // ── Ordinary paragraph / heading line ──
        var tag = info.tag;
        var align = _classifyAlign(L, frame, bodySize, isLastOfPara(b.idx), rtl);
        var inlineHtml = _lineToHtml(L.parts, rtl);
        if (!inlineHtml.trim()) { prevY = L.y; prevH = L.h; return; }

        var gapBreak = false;
        if (prevY !== null) {
          var gap = prevY - L.y;
          if (gap > prevH * 1.4) gapBreak = true;
        }

        if (openTag !== tag || gapBreak) {
          flushPara();
          openTag = tag;
          openAlign = align;
          openParts = [inlineHtml];
        } else {
          // merge into the current paragraph; majority alignment (ties → side)
          if (align && align !== 'justify') openAlign = openAlign || align;
          if (align === 'justify') openAlign = 'justify';
          openParts.push(inlineHtml);
        }
        prevY = L.y; prevH = L.h;
      });

      flushAll();
      return html;
    }

    // Normal (already-Unicode) editable path.
    function _pageToHtml(lines, images, bodySize, pageWidth, rects) {
      return _emitPage(lines, images, bodySize, pageWidth, false, rects);
    }

    // Visual-Hebrew editable path. Text is recovered PER ITEM in
    // _buildLinesFromItems(items, true); here we just run the same flow
    // pipeline with the RTL flag set.
    function _pageToHtmlVisualHebrew(items, images, bodySize, pageWidth, rects) {
      var lines = _buildLinesFromItems(items, true);
      return _emitPage(lines, images, bodySize, pageWidth, true, rects);
    }

    async function processFile(file) {
      if (!file) return;
      if (!window.pdfjsLib) { status.textContent = 'ספריית PDF לא נטענה'; return; }
      initPdfJs();
      status.textContent = 'קורא קובץ PDF…';
      status.style.color = 'var(--ink-mute)';
      bar.style.width = '5%';
      try {
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const n   = pdf.numPages;
        let html  = '';

        // ── EXACT mode: render each page to a faithful image (100% identical
        // design — letterhead, columns, alignment, logos — but not editable).
        if (getMode() === 'image') {
          const titleImg = _escHtml(file.name.replace(/\.pdf$/i, ''));
          let imgsHtml = '';
          for (let i = 1; i <= n; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            const src = canvas.toDataURL('image/jpeg', 0.85);
            page.cleanup && page.cleanup();
            const brk = i < n ? 'page-break-after:always;' : '';
            imgsHtml += '<div style="text-align:center;' + brk + '"><img width="700" src="' + src +
                        '" style="width:700px;max-width:100%;height:auto;" /></div>';
            bar.style.width = (5 + (i / n) * 88) + '%';
            status.textContent = 'מרנדר עמוד ' + i + ' / ' + n + '…';
          }
          const docImg = [
            "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
            " xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>",
            "<head><meta charset='utf-8'><title>" + titleImg + "</title>",
            "<style>@page Section1{size:595.3pt 841.9pt;margin:1cm 1cm 1cm 1cm;mso-paper-source:0;}",
            "div.Section1{page:Section1;} body{margin:0;padding:0;} img{max-width:100%;height:auto;}</style>",
            "</head><body dir='rtl'><div class='Section1'>", imgsHtml, "</div></body></html>"
          ].join('');
          const blobImg = new Blob(['﻿', docImg], { type: 'application/msword' });
          const urlImg = URL.createObjectURL(blobImg);
          const aImg = document.createElement('a');
          aImg.href = urlImg; aImg.download = file.name.replace(/\.pdf$/i, '.doc'); aImg.click();
          setTimeout(function () { URL.revokeObjectURL(urlImg); }, 2000);
          bar.style.width = '100%';
          status.textContent = '✓ הומרו ' + n + ' עמודים במראה זהה למקור — הורד ' + file.name.replace(/\.pdf$/i, '.doc');
          status.style.color = 'var(--sage-deep)';
          return;
        }

        const perPageItems   = new Array(n);
        const perPageImages  = new Array(n);
        const perPageWidth   = new Array(n);
        const perPageRects   = new Array(n);
        const CONCURRENCY    = 6;
        let nextPage         = 1;
        let donePages        = 0;

        const includeImages = imgCheckbox.checked;

        async function _processOnePage() {
          while (true) {
            const myIdx = nextPage++;
            if (myIdx > n) return;
            const page = await pdf.getPage(myIdx);
            const v = page.view || [0, 0, 612, 792];
            const pageW = v[2] - v[0];
            const pageH = v[3] - v[1];

            // getTextContent (geometry+text) and getOperatorList (color +
            // highlight + image graphics state) in parallel.
            let content, walk = null;
            try {
              const res = await Promise.all([
                page.getTextContent({ includeMarkedContent: false }),
                page.getOperatorList().catch(function (e) {
                  console.warn('[pdf2word] getOperatorList failed p' + myIdx + ':', e);
                  return null;
                })
              ]);
              content = res[0];
              const opList = res[1];
              if (opList && pdfjsLib.OPS) {
                walk = _walkOperatorList(opList, page);
              }
            } catch (e) {
              console.warn('[pdf2word] page ' + myIdx + ' analysis failed:', e);
              content = { items: [] };
            }

            let items = content.items || [];
            // Correlate colors + highlights onto the items (best-effort).
            if (walk) {
              try { _correlate(items, walk, pageW, pageH); }
              catch (e) { console.warn('[pdf2word] correlate p' + myIdx + ':', e); }
            }

            // Resolve images from the same operator walk.
            let images = [];
            if (includeImages && walk && walk.refs.length) {
              try { images = await _resolveImages(page, walk.refs); }
              catch (e) { console.warn('[pdf2word] images p' + myIdx + ':', e); }
            }

            perPageItems[myIdx - 1]  = items;
            perPageImages[myIdx - 1] = images;
            perPageWidth[myIdx - 1]  = pageW;
            perPageRects[myIdx - 1]  = walk ? walk.rects : [];
            donePages++;
            bar.style.width = (5 + (donePages / n) * 50) + '%';
            status.textContent = 'מנתח עמוד ' + donePages + ' / ' + n + '…';
            page.cleanup && page.cleanup();
          }
        }

        const workers = [];
        for (let w = 0; w < Math.min(CONCURRENCY, n); w++) workers.push(_processOnePage());
        await Promise.all(workers);

        const allItems = [].concat.apply([], perPageItems);
        const allLinesForBody = _buildLinesFromItems(allItems);
        const bodySize = _bodyFontSize(allLinesForBody);

        // Detect a SCANNED / image-only PDF (no real text layer). Such a PDF
        // cannot become editable text — there is no text in it, only pixels —
        // so we still convert (the page images are embedded) but tell the user
        // clearly instead of producing a near-empty "editable" document.
        const totalTextChars = allItems.reduce(function (s, it) { return s + ((it.str || '').length); }, 0);
        const isImageOnly = totalTextChars < 12;
        // Legacy Hebrew (Windows-1255 + visual order) needs a different builder
        // that recovers the real Unicode Hebrew and re-orders it logically.
        const isVisualHebrew = !isImageOnly && _detectVisualHebrew(allItems);

        status.textContent = 'בונה את מסמך ה-Word…';
        for (let i = 1; i <= n; i++) {
          bar.style.width = (55 + (i / n) * 40) + '%';
          let pageHtml;
          if (isVisualHebrew) {
            pageHtml = _pageToHtmlVisualHebrew(perPageItems[i - 1], perPageImages[i - 1], bodySize, perPageWidth[i - 1], perPageRects[i - 1]);
          } else {
            const lines = _buildLinesFromItems(perPageItems[i - 1]);
            pageHtml = _pageToHtml(lines, perPageImages[i - 1], bodySize, perPageWidth[i - 1], perPageRects[i - 1]);
          }
          if (n > 1) {
            html += '<p style="font-size:11px;color:#888;text-align:center;margin:20px 0 10px;direction:ltr;">— page ' + i + ' / ' + n + ' —</p>';
          }
          html += pageHtml;
        }
        bar.style.width = '100%';

        const titleHtml = _escHtml(file.name.replace(/\.pdf$/i, ''));
        // MSO HTML-as-.doc. UTF-8 BOM + application/msword keeps Hebrew/RTL
        // intact and Word opens it as a fully editable document.
        const docHtml = [
          "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
          " xmlns:w='urn:schemas-microsoft-com:office:word'",
          " xmlns='http://www.w3.org/TR/REC-html40'>",
          "<head><meta charset='utf-8'><title>" + titleHtml + "</title>",
          "<style>",
          "  @page Section1 { size:595.3pt 841.9pt; margin:2cm 2cm 2cm 2cm; mso-paper-source:0; }",
          "  div.Section1 { page:Section1; }",
          "  body { font-family: Arial, 'David', 'Times New Roman', serif; padding:0; max-width:820px; margin:0 auto; direction:rtl; }",
          "  h1 { font-size:22pt; font-weight:bold; margin:18px 0 10px; }",
          "  h2 { font-size:16pt; font-weight:bold; margin:14px 0 8px; }",
          "  h3 { font-size:13pt; font-weight:bold; margin:10px 0 6px; }",
          "  p  { font-size:12pt; line-height:1.7; margin:0 0 8px; }",
          "  p, h1, h2, h3, li { unicode-bidi: plaintext; direction: auto; text-align: right; }",
          "  table { border-collapse:collapse; width:100%; margin:8px 0; }",
          "  td { font-size:12pt; vertical-align:top; }",
          "  strong { font-weight: bold; }",
          "  em { font-style: italic; }",
          "  img { max-width:100%; height:auto; }",
          "</style>",
          "</head><body dir='rtl'><div class='Section1'>",
          // No injected filename heading — it created confusing empty space at
          // the top that isn't in the source. Start directly with the content.
          html, "</div></body></html>"
        ].join('');
        const blob = new Blob(['﻿', docHtml], { type: 'application/msword' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = file.name.replace(/\.pdf$/i, '.doc'); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        if (isImageOnly) {
          status.innerHTML = 'ℹ️ ל-PDF זה <strong>אין שכבת טקסט</strong> (הוא מורכב מתמונות סרוקות) — לכן אי אפשר לחלץ ממנו טקסט נערך. ' +
            'הורד קובץ Word עם תמונות העמודים. <strong>לטקסט נערך</strong>: ייצא את המסמך המקורי ל-Word ישירות (למשל מתוך "ייצוא ל-Word" במחברת).';
          status.style.color = 'var(--ink)';
        } else if (isVisualHebrew) {
          status.textContent = '✓ חולץ ' + n + ' עמודים — זוהה קידוד עברי ישן (Windows-1255) ושוחזר לטקסט נערך עם שמירת מבנה (יישור, כותרות, טבלאות) — הורד ' + file.name.replace(/\.pdf$/i, '.doc');
          status.style.color = 'var(--sage-deep)';
        } else {
          status.textContent = '✓ חולץ ' + n + ' עמודים עם טקסט נערך, יישור, כותרות, טבלאות, צבעים והדגשות — הורד ' + file.name.replace(/\.pdf$/i, '.doc');
          status.style.color = 'var(--sage-deep)';
        }
      } catch (e) {
        console.error('[pdf2word]', e);
        status.textContent = 'שגיאה: ' + (e && e.message ? e.message : 'לא ניתן לקרוא את ה-PDF') + ' (אולי מוגן בסיסמה?)';
        status.style.color = '#c00';
        bar.style.width = '0';
      }
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.pdf'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => processFile(fileInput.files[0]));

    const zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)' },
      onClick: () => fileInput.click()
    }, [
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '📄'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ PDF לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } }, 'או לחץ לבחירה · .pdf')
    ]);
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.style.borderColor = 'var(--butter-deep)'; zone.style.background = 'var(--butter)'; });
    zone.addEventListener('dragleave', ()  => { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      processFile(e.dataTransfer.files[0]);
    });

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '📄  PDF  →  Word'),
        App.el('span', { class: 'chip butter' }, 'המר PDF ל-Word נערך עם צבעים והדגשות')
      ]),
      fileInput, zone, optsRow, status, bar,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '✨ בחר מצב: "טקסט נערך" — מחלץ טקסט לעריכה (כולל שחזור עברית מקודדת ישנה Windows-1255), עם שמירת מבנה: יישור פסקאות, כותרות, הדגשות, וטבלאות לשורות דו-טוריות. "מראה מדויק" — כל עמוד כתמונה, עיצוב זהה ל-100% למקור, אך לא ניתן לעריכה. לעיצוב רשמי מדויק בחר "מראה מדויק"; לעריכת תוכן בחר "טקסט נערך".')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfToWord = buildPdfToWord;
})();
