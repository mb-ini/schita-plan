/* night-wheel prototype renderer.
   No dependencies, no network. Reads window.NIGHT_WHEEL (data/model.js).
   Navigation is pure data lookup: every link drawn is a modelled relationship. */
(function () {
  'use strict';

  var M = window.NIGHT_WHEEL;
  if (!M) { document.body.textContent = 'data/model.js failed to load'; return; }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var N = M.products.length;
  var TAU = Math.PI * 2;

  var R_HUB = 66;
  var R_RINGS_START = 66;
  var R_RINGS_END = 196;
  var R_LEAF = [196, 272];
  var R_LABEL = 280;
  // Rings are allocated at render time across however many rings the lens actually
  // shows, so a lens with one informative ring gets the full band instead of a sliver.
  var RINGS = [];

  var lensIndex = 0;
  var pinned = null;
  var hovered = null;

  var byId = {};
  M.products.forEach(function (p) { byId[p.id] = p; });

  // ---- geometry ---------------------------------------------------------------
  function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

  function pt(r, a) { return [r * Math.sin(a), -r * Math.cos(a)]; }

  function arcPath(r0, r1, a0, a1) {
    var A = pt(r1, a0), B = pt(r1, a1), C = pt(r0, a1), D = pt(r0, a0);
    var large = (a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + fmt(A[0]) + ' ' + fmt(A[1]) +
      'A' + fmt(r1) + ' ' + fmt(r1) + ' 0 ' + large + ' 1 ' + fmt(B[0]) + ' ' + fmt(B[1]) +
      'L' + fmt(C[0]) + ' ' + fmt(C[1]) +
      'A' + fmt(r0) + ' ' + fmt(r0) + ' 0 ' + large + ' 0 ' + fmt(D[0]) + ' ' + fmt(D[1]) + 'Z';
  }

  function leafAngles(i) {
    var step = TAU / N;
    var pad = step * 0.055;
    return [i * step + pad, (i + 1) * step - pad];
  }

  function spanAngles(from, to) {
    var step = TAU / N;
    var pad = step * 0.03;
    return [from * step + pad, (to + 1) * step - pad];
  }

  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---- render -----------------------------------------------------------------
  var gRings = document.getElementById('rings');
  var gLeaves = document.getElementById('leaves');
  var gSpokes = document.getElementById('spokes');
  var gLabels = document.getElementById('labels');
  var gLeafLabels = document.getElementById('leaflabels');
  var gHub = document.getElementById('hub');
  var gLanes = document.getElementById('lanes');
  var gCross = document.getElementById('crosslinks');
  var view = 'lanes';   // primary view; the wheel is the secondary overview lens

  // lanes geometry
  var ROW_H = 26;
  var RAIL_W = 168;
  // 118 is the minimum width at which a lane's labels stay legible, and it makes the
  // whole SVG (168 + 5*126 = 798) fit a 1280 viewport 1:1. Wider lanes meant the SVG
  // was scaled to 0.92 there, dragging every label under 9.5px.
  var LANE_W = 118;
  var LANE_GAP = 8;
  var HEAD_H = 46;

  function renderHub() {
    clear(gHub);
    el('circle', { r: R_HUB - 2, fill: 'var(--surface)', stroke: 'var(--line-strong)' }, gHub);
    var t = el('text', { class: 'hublabel', 'text-anchor': 'middle', y: -6 }, gHub);
    t.textContent = 'Foreign';
    var t2 = el('text', { class: 'hublabel', 'text-anchor': 'middle', y: 9 }, gHub);
    t2.textContent = 'Exchange';
    var t3 = el('text', { class: 'hubsub', 'text-anchor': 'middle', y: 26 }, gHub);
    t3.textContent = N + ' products';
  }

  function renderRings() {
    clear(gRings);
    clear(gLabels);
    var lens = M.lenses[lensIndex];

    // A ring whose every leaf falls in one segment carries no distinction the hub
    // does not already state, so it is not drawn. The remaining rings share the band.
    var shown = lens.rings.filter(function (r) { return r.segments.length > 1; });
    var band = (R_RINGS_END - R_RINGS_START) / Math.max(1, shown.length);
    RINGS = shown.map(function (_, i) {
      return [R_RINGS_START + i * band, R_RINGS_START + (i + 1) * band];
    });

    shown.forEach(function (ring, depth) {
      var rr = RINGS[depth];
      if (!rr) return;
      ring.segments.forEach(function (seg, si) {
        var a = spanAngles(seg.from, seg.to);
        var isUnmapped = /unmapped|no CDM/i.test(seg.key) || /unmapped|no CDM/i.test(seg.label);
        var cls = 'seg r' + depth + (isUnmapped ? ' unmapped' : '');
        var path = el('path', {
          class: cls, d: arcPath(rr[0], rr[1], a[0], a[1]),
          'data-depth': depth, 'data-seg': si, 'data-leaves': seg.leaves.join(',')
        }, gRings);
        path.addEventListener('mouseenter', function () { setHoverSeg(seg.leaves); });
        path.addEventListener('mouseleave', function () { setHoverSeg(null); });

        // label: arc text if the wedge is wide enough, else nothing (legibility over completeness)
        var mid = (a[0] + a[1]) / 2;
        var widthPx = (a[1] - a[0]) * ((rr[0] + rr[1]) / 2);
        var thickness = rr[1] - rr[0];
        var label = seg.label;
        if (widthPx > 34) {
          var r = (rr[0] + rr[1]) / 2;
          var p = pt(r, mid);
          var degrees = mid * 180 / Math.PI;
          // Two orientations need two different flip rules, and using one for both is
          // what put nine labels upside down.
          //   tangential text is rotated by `degrees`      -> upright for degrees in (270,360)+(0,90)
          //   radial text is rotated by `degrees - 90`     -> upright for degrees in (0,180)
          var radial = thickness > 60;
          var flip = radial ? (degrees > 180) : (degrees > 90 && degrees < 270);
          var rot = radial ? (flip ? degrees + 90 : degrees - 90)
                           : (flip ? degrees + 180 : degrees);
          var budget = radial ? thickness : widthPx;
          var maxChars = Math.max(3, Math.floor(budget / 5.6));
          var shown = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
          // A radial label's HEIGHT runs across the segment's arc, so a narrow segment
          // would collide with its neighbours. And a stub of three letters tells the
          // reader nothing the tooltip and panel do not. In both cases, draw nothing.
          var innerWidthPx = (a[1] - a[0]) * rr[0];
          var tooNarrow = radial && innerWidthPx < 16;
          var tooStubby = shown.length < 6 && label.length > shown.length;
          if (tooNarrow || tooStubby) { shown = null; }
          if (shown !== null) {
          var tx = el('text', {
            class: 'seglabel' + (radial ? ' radial' : ''),
            'text-anchor': 'middle', 'dominant-baseline': 'central',
            transform: 'translate(' + fmt(p[0]) + ',' + fmt(p[1]) + ') rotate(' + fmt(rot) + ')',
            'data-leaves': seg.leaves.join(',')
          }, gLabels);
          tx.textContent = shown;
          var ttl = el('title', {}, tx);
          ttl.textContent = label;
          }
        }
        var segTitle = el('title', {}, path);
        segTitle.textContent = ring.ring + ': ' + seg.label + (seg.detail ? ' — ' + seg.detail : '');
      });
    });
  }

  function renderLeaves() {
    clear(gLeaves);
    clear(gSpokes);
    M.products.forEach(function (p, i) {
      var a = leafAngles(i);
      var g = el('path', {
        class: 'leaf t-' + p.upi.instrumentType,
        d: arcPath(R_LEAF[0], R_LEAF[1], a[0], a[1]),
        tabindex: '0', role: 'button', 'data-i': i,
        'aria-label': (p.upi.qualifiedName || p.upi.product.replace(/_/g, ' ')) +
          ', ' + p.upi.instrumentType
      }, gLeaves);
      var ti = el('title', {}, g);
      ti.textContent = p.upi.instrumentType + ' / ' + p.upi.product.replace(/_/g, ' ');

      g.addEventListener('mouseenter', function () { hovered = i; paint(); showPanel(i); });
      g.addEventListener('mouseleave', function () { hovered = null; paint(); if (pinned === null) hidePanel(); else showPanel(pinned); });
      g.addEventListener('focus', function () { hovered = i; paint(); showPanel(i); });
      g.addEventListener('blur', function () { hovered = null; paint(); });
      g.addEventListener('click', function () { pinned = (pinned === i) ? null : i; paint(); if (pinned === null) hidePanel(); else showPanel(pinned); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.click(); return; }
        if (e.key === 'Escape') { pinned = null; paint(); hidePanel(); return; }
        var d = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1
          : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
        if (d) {
          e.preventDefault();
          var next = (i + d + N) % N;
          var nodes = gLeaves.querySelectorAll('.leaf');
          if (nodes[next]) nodes[next].focus();
        }
      });

      // spoke from hub to leaf, shown on highlight
      var mid = (a[0] + a[1]) / 2;
      var s0 = pt(R_HUB, mid), s1 = pt(R_LEAF[0], mid);
      el('line', {
        class: 'spoke', 'data-i': i,
        x1: fmt(s0[0]), y1: fmt(s0[1]), x2: fmt(s1[0]), y2: fmt(s1[1])
      }, gSpokes);

      // rim label
      var lp = pt(R_LABEL, mid);
      var degrees = mid * 180 / Math.PI;
      // Rim labels point outward along the radius, so they read right way up for
      // degrees in (0,180) and must be flipped on the left half of the circle.
      var flip = degrees > 180;
      var rot = flip ? degrees + 90 : degrees - 90;
      var tx = el('text', {
        class: 'leaflabel', 'data-i': i,
        'text-anchor': flip ? 'end' : 'start',
        'dominant-baseline': 'central',
        transform: 'translate(' + fmt(lp[0]) + ',' + fmt(lp[1]) + ') rotate(' + fmt(rot) + ')'
      }, gLeafLabels);
      // Short name on the rim: the budget there is ~17 characters and an ellipsised
      // identifier hides which product you are looking at. Full name in the tooltip.
      tx.textContent = p.upi.shortName || p.upi.product.replace(/_/g, ' ');
      var txt = el('title', {}, tx);
      txt.textContent = p.upi.qualifiedName || p.upi.displayName;
    });
  }

  function setHoverSeg(leaves) {
    gRings.setAttribute('data-hoverseg', leaves ? leaves.join(',') : '');
    paint(leaves);
  }

  function paint(segLeaves) {
    var active = (hovered !== null) ? hovered : pinned;
    var lit = null;
    if (segLeaves) lit = segLeaves;
    else if (active !== null) lit = [active];

    var i, nodes;
    nodes = gLeaves.querySelectorAll('.leaf');
    for (i = 0; i < nodes.length; i++) {
      var li = +nodes[i].getAttribute('data-i');
      nodes[i].classList.toggle('lit', !!lit && lit.indexOf(li) >= 0);
      nodes[i].classList.toggle('dim', !!lit && lit.indexOf(li) < 0);
    }
    nodes = gSpokes.querySelectorAll('.spoke');
    for (i = 0; i < nodes.length; i++) {
      var si = +nodes[i].getAttribute('data-i');
      nodes[i].classList.toggle('lit', !!lit && lit.indexOf(si) >= 0);
    }
    nodes = gRings.querySelectorAll('.seg');
    for (i = 0; i < nodes.length; i++) {
      var sl = nodes[i].getAttribute('data-leaves').split(',').map(Number);
      var hit = !!lit && sl.some(function (x) { return lit.indexOf(x) >= 0; });
      nodes[i].classList.toggle('lit', hit);
      nodes[i].classList.toggle('dim', !!lit && !hit);
    }
    paintLanes(lit);

    nodes = [].slice.call(gLabels.querySelectorAll('.seglabel, .leaflabel'))
      .concat([].slice.call(gLeafLabels.querySelectorAll('.seglabel, .leaflabel')));
    for (i = 0; i < nodes.length; i++) {
      var dl = nodes[i].getAttribute('data-leaves');
      var di = nodes[i].getAttribute('data-i');
      var mine = dl ? dl.split(',').map(Number) : [+di];
      var on = !!lit && mine.some(function (x) { return lit.indexOf(x) >= 0; });
      nodes[i].classList.toggle('lit', on);
      nodes[i].classList.toggle('dim', !!lit && !on);
    }
  }

  // ---- panel ------------------------------------------------------------------
  var panelEmpty = document.getElementById('panelEmpty');
  var panelBody = document.getElementById('panelBody');

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function badge(method) {
    return '<span class="badge ' + esc(method) + '">' + esc(method) + '</span>';
  }

  function citeList(cs) {
    if (!cs || !cs.length) return '';
    return '<div class="cites">' + cs.map(function (c) {
      return '<div><code>' + esc(c.file) + '</code> &middot; ' + esc(c.at) + '</div>';
    }).join('') + '</div>';
  }

  function hidePanel() {
    panelBody.hidden = true;
    panelEmpty.hidden = false;
  }

  function showPanel(i) {
    var p = M.products[i];
    if (!p) return;
    var h = [];

    h.push('<div class="prodhead">');
    h.push('<div class="eyebrow">' + esc(p.upi.assetClass.replace(/_/g, ' ')) + ' &middot; ' + esc(p.upi.instrumentType) + '</div>');
    h.push('<h2>' + esc(p.upi.qualifiedName || p.upi.product.replace(/_/g, ' ')) + '</h2>');
    h.push('<code>' + esc(p.upi.template) + '</code>');
    h.push('</div>');

    // --- CFI: the assembled code -------------------------------------------
    h.push('<div class="std"><h3>CFI &middot; ISO 10962 ' + badge(p.cfi.categoryMethod) + '</h3><div>');
    var mask = p.cfi.mask.split('').map(function (ch, idx) {
      return ch === '·' ? '<span class="free">' + ch + '</span>' : esc(ch);
    }).join('');
    h.push('<div class="cfimask">' + mask + '</div>');
    h.push('<p>' + esc(p.cfi.codeCount) + ' legal six-character code' + (p.cfi.codeCount === 1 ? '' : 's') +
      ' match this template. The template pins the characters shown and leaves <span class="free">&middot;</span> free.</p>');
    if (p.cfi.categoryNote) h.push('<p class="note">' + esc(p.cfi.categoryNote) + '</p>');
    h.push('<table class="pos"><tr><th>Char</th><th>CFI attribute</th><th>Letters</th><th>Derived from</th></tr>');
    h.push('<tr><td><code>1</code></td><td>Category</td><td class="letters">' + esc(p.cfi.category) +
      '</td><td>' + esc(p.cfi.categoryName) + '</td></tr>');
    h.push('<tr><td><code>2</code></td><td>Group</td><td class="letters">' + esc(p.cfi.group) +
      '</td><td>' + esc(p.cfi.groupName) + '</td></tr>');
    p.cfi.positions.forEach(function (pos) {
      var via = pos.viaUpiAttribute
        ? 'UPI <em>' + esc(pos.viaUpiAttribute) + '</em>'
        : '<span class="muted">not constrained by UPI</span>';
      var meanings = pos.letters.map(function (l) {
        return '<code>' + esc(l) + '</code> ' + esc(pos.meanings[l]);
      }).join('<br>');
      h.push('<tr><td><code>' + pos.position + '</code></td><td>' + esc(pos.cfiAttribute) +
        '</td><td class="letters">' + esc(pos.letters.join('')) + '</td><td>' + via + '</td></tr>');
      h.push('<tr><td></td><td colspan="3" class="muted" style="font-size:11px">' + meanings + '</td></tr>');
    });
    h.push('</table>');
    var unres = p.cfi.positions.filter(function (x) { return x.unresolved && x.unresolved.length; });
    if (unres.length) {
      h.push('<p class="note"><strong>Unresolved join:</strong> ' + unres.map(function (u) {
        return 'character ' + u.position + ' &mdash; UPI value' +
          (u.unresolved.length > 1 ? 's ' : ' ') + u.unresolved.map(function (v) { return '&ldquo;' + esc(v) + '&rdquo;'; }).join(', ') +
          ' has no CFI counterpart at that position';
      }).join('; ') + '. Reported rather than guessed.</p>');
    }
    var methods = {};
    p.cfi.positions.forEach(function (pos) {
      (pos.mappings || []).forEach(function (m) { methods[m.method] = (methods[m.method] || 0) + 1; });
    });
    h.push('<p class="muted" style="font-size:11px;margin-top:7px">Value-join methods: ' +
      Object.keys(methods).sort().map(function (k) { return k + ' ×' + methods[k]; }).join(', ') + '</p>');
    h.push(citeList(p.cfi.positions.length ? p.cfi.positions[0].citations : []));
    h.push('</div></div>');

    // --- UPI ---------------------------------------------------------------
    h.push('<div class="std"><h3>UPI &middot; ISO 4914 / ANNA-DSB ' + badge('exact') + '</h3><div>');
    h.push('<p>' + p.upi.definingCount + ' of ' + p.upi.attributeCount +
      ' attributes are UPI-defining &mdash; those are what distinguish this product from its siblings. ' +
      'The rest are derived or administrative.</p>');
    var defs = p.attributes.filter(function (a) { return a.defining; });
    h.push('<table class="pos"><tr><th>Defining attribute</th><th>Allowed values</th></tr>');
    defs.forEach(function (a) {
      var av = a.allowedValues;
      var shown = !av ? '<span class="muted">open</span>'
        : (av.length > 5 ? esc(av.slice(0, 5).join(', ')) + ' &hellip; (' + av.length + ')' : esc(av.join(', ')));
      h.push('<tr><td>' + esc(a.name) + '</td><td>' + shown + '</td></tr>');
    });
    h.push('</table>');
    h.push(citeList([p.upi.citation]));
    h.push('</div></div>');

    // --- CDM ---------------------------------------------------------------
    var cdmMethod = p.cdm.functions.length ? p.cdm.method : 'absent';
    h.push('<div class="std"><h3>CDM &middot; ISDA / FINOS ' + badge(cdmMethod) + '</h3><div>');
    if (!p.cdm.functions.length) {
      h.push('<p>No CDM qualification function names this product. CDM qualifies ' +
        (M.products.filter(function (q) { return q.cdm.functions.length; }).length) +
        ' of the ' + N + ' DSB templates; this is one of the rest.</p>');
    } else {
      h.push('<p>Payout composition: <strong>' + esc(p.cdm.payouts.join(' + ')) + '</strong>. ' +
        'CDM derives the product name from the composition by evaluating these conditions.</p>');
      p.cdm.functions.forEach(function (f) {
        h.push('<p style="margin-top:8px"><code>' + esc(f.qualificationFunction) + '</code></p>');
        h.push('<ul class="cond">' + f.conditions.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>');
        if (f.calls.length) {
          h.push('<p class="muted" style="font-size:11px;margin-top:5px">calls: ' +
            f.calls.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(', ') + '</p>');
        }
        if (f.note) h.push('<p class="note">' + esc(f.note) + '</p>');
      });
      h.push(citeList(p.cdm.functions.map(function (f) { return f.citation; })));
    }
    h.push('</div></div>');

    // --- FpML --------------------------------------------------------------
    h.push('<div class="std"><h3>FpML &middot; 5.14 ' + badge(p.fpml.method) + '</h3><div>');
    if (!p.fpml.elements.length) {
      h.push('<p>No FpML product element corresponds to this template.</p>');
    } else {
      h.push('<table class="pos"><tr><th>Element</th><th>complexType</th></tr>');
      p.fpml.elements.forEach(function (e) {
        h.push('<tr><td><code>' + esc(e.element) + '</code></td><td><code>' + esc(e.type) + '</code></td></tr>');
      });
      h.push('</table>');
    }
    if (p.fpml.note) h.push('<p class="note">' + esc(p.fpml.note) + '</p>');
    h.push(citeList(p.fpml.elements.map(function (e) { return e.citation; })));
    h.push('</div></div>');

    // --- FIBO --------------------------------------------------------------
    h.push('<div class="std"><h3>FIBO ' + badge(p.fibo.method) + '</h3><div>');
    if (!p.fibo['class']) {
      h.push('<p>FIBO asserts no class for this product.</p>');
    } else {
      var c = p.fibo['class'];
      h.push('<p><strong>' + esc(c.localName) + '</strong> &middot; <span class="muted">' + esc(c.module) + '</span></p>');
      if (c.definition) h.push('<p class="muted" style="font-size:12px">' + esc(c.definition) + '</p>');
      h.push('<p class="muted" style="font-size:10.5px"><code>' + esc(c.iri) + '</code></p>');
      if (p.fibo.chains.length > 1) {
        h.push('<p style="margin-top:9px"><strong>' + p.fibo.chains.length +
          ' distinct parent chains</strong> reach a root. FIBO is a DAG, not a tree &mdash; which is ' +
          'why FIBO gets no ring in this wheel: a class with two parents has no single wedge.</p>');
      }
      p.fibo.chains.forEach(function (ch) {
        h.push('<p class="chain">' + ch.map(function (n) {
          return n.vendored ? esc(n.localName) : '<span class="dangle">' + esc(n.localName) + '</span>';
        }).join(' → ') + '</p>');
      });
      h.push('<p class="muted" style="font-size:10.5px">Italic names are parents referenced outside the vendored subset.</p>');
    }
    if (p.fibo.note) h.push('<p class="note">' + esc(p.fibo.note) + '</p>');
    if (p.fibo['class']) h.push(citeList([p.fibo['class'].citation]));
    h.push('</div></div>');

    panelBody.innerHTML = h.join('');
    panelBody.hidden = false;
    panelEmpty.hidden = true;
  }

  // ---- lanes ------------------------------------------------------------------
  // One column per standard over the SAME fixed product rail. Row position encodes
  // product identity, so a row read across all five lanes is one product seen five ways.
  function renderLanes() {
    clear(gLanes);
    var L = M.lanes;
    var W = RAIL_W + L.length * (LANE_W + LANE_GAP);
    var H = HEAD_H + N * ROW_H + 10;
    gLanes.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    // row backgrounds + rail labels
    M.products.forEach(function (p, i) {
      var y = HEAD_H + i * ROW_H;
      var bg = el('rect', {
        class: 'railrow', 'data-i': i, x: 0, y: fmt(y), width: W, height: ROW_H
      }, gLanes);
      var bgt = el('title', {}, bg);
      bgt.textContent = p.upi.instrumentType + ' / ' + p.upi.product.replace(/_/g, ' ') +
        ' — click to pin';
      bg.addEventListener('mouseenter', function () { hovered = i; paint(); showPanel(i); });
      bg.addEventListener('mouseleave', function () { hovered = null; paint(); if (pinned === null) hidePanel(); });
      bg.addEventListener('click', function () {
        pinned = (pinned === i) ? null : i; paint();
        if (pinned === null) hidePanel(); else showPanel(pinned);
      });

      var t = el('text', {
        class: 'raillabel', 'data-i': i, x: RAIL_W - 12, y: fmt(y + ROW_H / 2 + 1),
        'text-anchor': 'end', 'dominant-baseline': 'central'
      }, gLanes);
      t.textContent = p.upi.displayName || p.upi.product.replace(/_/g, ' ');

    });

    // One labelled bracket per instrument-type run, replacing the per-row FOR/OPT/SWA
    // tag. At 1280 that tag rendered at ~8.1px, below any reasonable floor. The rows are
    // already contiguous by type, so a bracket says the same thing once, legibly, and
    // gives the rail its width back.
    var runStart = 0;
    for (var ri = 1; ri <= N; ri++) {
      if (ri < N && M.products[ri].upi.instrumentType === M.products[runStart].upi.instrumentType) continue;
      var yTop = HEAD_H + runStart * ROW_H + 3;
      var yBot = HEAD_H + ri * ROW_H - 3;
      el('path', {
        class: 'railbracket',
        d: 'M22 ' + fmt(yTop + 5) + 'q0 -5 5 -5 M22 ' + fmt(yTop + 5) + 'L22 ' + fmt(yBot - 5) +
           ' M22 ' + fmt(yBot - 5) + 'q0 5 5 5'
      }, gLanes);
      var bl = el('text', {
        class: 'railbracketlabel', 'text-anchor': 'middle',
        'dominant-baseline': 'central',
        transform: 'translate(13,' + fmt((yTop + yBot) / 2) + ') rotate(-90)'
      }, gLanes);
      bl.textContent = M.products[runStart].upi.instrumentType.toUpperCase();
      runStart = ri;
    }

    L.forEach(function (lane, li) {
      var x0 = RAIL_W + li * (LANE_W + LANE_GAP);

      var th = el('text', { class: 'lanehead', x: fmt(x0), y: 14 }, gLanes);
      th.textContent = lane.title;
      var ts = el('text', { class: 'lanesub', x: fmt(x0), y: 27 }, gLanes);
      ts.textContent = lane.subtitle;
      var tstat = el('text', { class: 'lanestat', x: fmt(x0), y: 39 }, gLanes);
      // Kept terse on purpose: the stat line must fit inside LANE_W or it collides
      // with the next lane's header. The full sentence lives in the tooltip.
      tstat.textContent = lane.distinctGroups + ' grp \u00b7 ' + lane.covered + '/' + N +
        (lane.fragmented ? ' \u00b7 ' + lane.fragments + ' blk' : '');
      var tstatTitle = el('title', {}, tstat);
      tstatTitle.textContent = lane.distinctGroups + ' distinct groups, ' + lane.covered +
        ' of ' + N + ' products covered' +
        (lane.fragmented ? ', split into ' + lane.fragments + ' blocks because this ' +
          'classification groups products in an order that cuts across the rail' : '');

      lane.blocks.forEach(function (b) {
        var y = HEAD_H + b.from * ROW_H;
        var h = (b.to - b.from + 1) * ROW_H;
        var leaves = [];
        for (var k = b.from; k <= b.to; k++) leaves.push(k);
        var isAbsent = b.key === 'absent' || b.key === 'unmapped';
        var r = el('rect', {
          class: 'block' + (isAbsent ? ' unmapped' : ''),
          'data-leaves': leaves.join(','),
          x: fmt(x0), y: fmt(y + 1.5), width: LANE_W, height: fmt(h - 3), rx: 4
        }, gLanes);
        if (isAbsent) { r.setAttribute('fill', 'none'); r.setAttribute('stroke', 'var(--line)'); }
        var ti = el('title', {}, r);
        ti.textContent = lane.title + ': ' + b.label;

        if (h >= 18) {
          var maxChars = Math.floor((LANE_W - 22) / 5.7);
          var label;
          if (b.code) {
            // Never cut the 2-character CFI identifier: show the code, then as much of
            // its gloss as fits.
            var room = maxChars - b.code.length - 3;
            label = b.code + (room > 3
              ? ' \u00b7 ' + (b.gloss.length > room ? b.gloss.slice(0, room - 1) + '\u2026' : b.gloss)
              : '');
          } else if (b.terms && b.terms.length > 1) {
            // A compound group is marked structurally rather than joined and truncated:
            // "ParameterReturnVariance +1" beats "ParameterReturnVariance + Parameter\u2026".
            var first = b.terms[0];
            var chip = ' +' + (b.terms.length - 1);
            var room2 = maxChars - chip.length;
            label = (first.length > room2 ? first.slice(0, room2 - 1) + '\u2026' : first) + chip;
          } else {
            label = b.label.length > maxChars ? b.label.slice(0, maxChars - 1) + '\u2026' : b.label;
          }
          var tl = el('text', {
            class: 'blocklabel', 'data-leaves': leaves.join(','),
            x: fmt(x0 + LANE_W / 2 + 6), y: fmt(y + h / 2),
            'text-anchor': 'middle', 'dominant-baseline': 'central'
          }, gLanes);
          tl.textContent = label;
          var tl2 = el('title', {}, tl);
          tl2.textContent = b.label;
        }
      });

      // Fragmentation made visible AT REST: when one group appears as several
      // separate blocks, connect them with a hairline down the lane's right edge.
      // Without this you cannot see that CDM/FpML/FIBO cut across the rail order
      // until you start hovering.
      var byKey = {};
      lane.blocks.forEach(function (b) {
        (byKey[b.key] = byKey[b.key] || []).push(b);
      });
      Object.keys(byKey).sort().forEach(function (k) {
        var bs = byKey[k];
        if (bs.length < 2) return;
        var xf = x0 + LANE_W - 5;
        var first = HEAD_H + bs[0].from * ROW_H;
        var last = HEAD_H + (bs[bs.length - 1].to + 1) * ROW_H;
        el('line', {
          class: 'fraglink', x1: fmt(xf), y1: fmt(first + 3),
          x2: fmt(xf), y2: fmt(last - 3)
        }, gLanes);
        bs.forEach(function (b) {
          var yc = HEAD_H + (b.from + (b.to - b.from + 1) / 2) * ROW_H;
          el('circle', { class: 'fragdot', cx: fmt(xf), cy: fmt(yc), r: 1.9 }, gLanes);
        });
      });

      // per-row mapping-strength marker, so coverage is legible row by row
      lane.rows.forEach(function (row, i) {
        var y = HEAD_H + i * ROW_H + ROW_H / 2;
        var m = el('circle', {
          class: 'mark ' + row.strength, 'data-i': i,
          cx: fmt(x0 + 9), cy: fmt(y), r: 3.6
        }, gLanes);
        var ti2 = el('title', {}, m);
        ti2.textContent = row.strength + (row.note ? ' \u2014 ' + row.note : '');
      });
    });

    // clear(gLanes) above detached the cross-link group, and SVG paints in document
    // order, so re-append it last: it must survive the clear AND sit above the blocks.
    gLanes.appendChild(gCross);
  }

  // Cross-lane links: drawn only for the selected row, because 17 rows x 5 lanes at
  // rest is spaghetti. The line STYLE carries the relation type, so the reader sees at
  // a glance where a standard agrees exactly, where it only has something broader, and
  // where it has nothing at all.
  function renderCrossLinks(i) {
    clear(gCross);
    if (i === null || i === undefined) return;
    var y = HEAD_H + i * ROW_H + ROW_H / 2;
    var xs = [RAIL_W - 16];
    for (var k = 0; k < M.lanes.length; k++) {
      xs.push(RAIL_W + k * (LANE_W + LANE_GAP) + 9);
    }
    for (var k2 = 0; k2 < M.lanes.length; k2++) {
      var row = M.lanes[k2].rows[i];
      var xa = xs[k2], xb = xs[k2 + 1];
      if (row.strength === 'absent') {
        // An absence is drawn, not left blank: a faint stub that stops short, so the
        // reader can tell "this standard has nothing here" from "nothing was rendered".
        el('line', {
          class: 'xlink absent', x1: fmt(xa), y1: fmt(y),
          x2: fmt(xa + (xb - xa) * 0.45), y2: fmt(y)
        }, gCross);
        el('circle', {
          class: 'xstop', cx: fmt(xa + (xb - xa) * 0.45 + 3), cy: fmt(y), r: 2.6
        }, gCross);
      } else {
        el('line', {
          class: 'xlink ' + row.strength, x1: fmt(xa), y1: fmt(y),
          x2: fmt(xb), y2: fmt(y)
        }, gCross);
      }
      var t = el('title', {}, el('circle', {
        class: 'xnode ' + row.strength, cx: fmt(xb), cy: fmt(y), r: 3.2
      }, gCross));
      t.textContent = M.lanes[k2].title + ': ' + row.label + ' (' + row.strength + ')';
    }
  }

  function paintLanes(lit) {
    var i, nodes;
    renderCrossLinks(lit && lit.length === 1 ? lit[0] : null);
    nodes = gLanes.querySelectorAll('.railrow');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('lit', !!lit && lit.indexOf(+nodes[i].getAttribute('data-i')) >= 0);
    }
    nodes = gLanes.querySelectorAll('.raillabel');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('lit', !!lit && lit.indexOf(+nodes[i].getAttribute('data-i')) >= 0);
    }
    nodes = gLanes.querySelectorAll('.block, .blocklabel');
    for (i = 0; i < nodes.length; i++) {
      var sl = (nodes[i].getAttribute('data-leaves') || '').split(',').map(Number);
      var hit = !!lit && sl.some(function (x) { return lit.indexOf(x) >= 0; });
      nodes[i].classList.toggle('lit', hit);
      nodes[i].classList.toggle('dim', !!lit && !hit);
    }
    nodes = gLanes.querySelectorAll('.mark');
    for (i = 0; i < nodes.length; i++) {
      var mi = +nodes[i].getAttribute('data-i');
      nodes[i].classList.toggle('dim', !!lit && lit.indexOf(mi) < 0);
    }
  }

  // Below ~1000px the SVGs would scale their labels to about 6px, so they are hidden
  // by CSS and this list replaces them. It carries the same five-standard summary per
  // product and opens the same detail panel, so nothing is lost but the geometry.
  function renderNarrow() {
    var ul = document.getElementById('narrowlist');
    if (!ul) return;
    clear(ul);
    M.products.forEach(function (p, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.className = 'narrowitem';
      b.type = 'button';
      var chips = M.lanes.map(function (L) {
        var row = L.rows[i];
        return '<span class="nchip ' + esc(row.strength) + '">' + esc(L.title) + ': ' +
          esc(row.label) + '</span>';
      }).join('');
      b.innerHTML = '<b>' + esc(p.upi.qualifiedName || p.upi.displayName) + '</b>' +
        '<span class="meta">' + esc(p.upi.instrumentType) + ' \u00b7 ' +
        esc(p.cfi.mask) + '</span><span class="narrowchips">' + chips + '</span>';
      b.addEventListener('click', function () {
        pinned = i; paint(); showPanel(i);
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function renderViews() {
    var nav = document.getElementById('views');
    clear(nav);
    [['wheel', 'Wheel'], ['lanes', 'Lanes']].forEach(function (v) {
      var b = document.createElement('button');
      b.className = 'viewbtn';
      b.type = 'button';
      b.textContent = v[1];
      b.setAttribute('aria-pressed', view === v[0] ? 'true' : 'false');
      b.addEventListener('click', function () { setView(v[0]); });
      nav.appendChild(b);
    });
  }

  function setView(v) {
    view = v;
    document.getElementById('wheelview').hidden = (v !== 'wheel');
    document.getElementById('lanesview').hidden = (v !== 'lanes');
    document.getElementById('lenses').hidden = (v !== 'wheel');
    document.getElementById('hint').textContent = (v === 'wheel')
      ? 'Hover or focus a product on the rim. Arrow keys move around the rim; Enter pins a product; Escape unpins.'
      : 'Each row is one product seen five ways. Hover a row to read it across every standard; click to pin.';
    renderViews();
    paint();
  }

  // ---- chrome -----------------------------------------------------------------
  function renderLenses() {
    var nav = document.getElementById('lenses');
    clear(nav);
    M.lenses.forEach(function (L, i) {
      var b = document.createElement('button');
      b.className = 'lensbtn';
      b.type = 'button';
      b.textContent = L.title;
      b.setAttribute('aria-pressed', i === lensIndex ? 'true' : 'false');
      b.addEventListener('click', function () {
        lensIndex = i;
        renderLenses();
        renderRings();
        paint();
        renderLensNote();
      });
      nav.appendChild(b);
    });
  }

  function renderLensNote() {
    var L = M.lenses[lensIndex];
    var frag = L.rings.some(function (r) { return r.fragmented; });
    document.getElementById('lensnote').innerHTML =
      '<strong>' + esc(L.title) + '.</strong> ' + esc(L.subtitle) +
      (L.note ? '<em>' + esc(L.note) + '</em>' : '') +
      (frag ? '<em>Rings are split into repeated segments because this classification groups products in an order that cuts across the rim — that fragmentation is the disagreement.</em>' : '');
  }

  function renderStats() {
    var cs = M.meta.cfiFxCodeSpace;
    var qualified = M.products.filter(function (p) { return p.cdm.functions.length; }).length;
    var fiboExact = M.products.filter(function (p) { return p.fibo.method === 'exact'; }).length;
    var fiboAbsent = M.products.filter(function (p) { return p.fibo.method === 'absent'; }).length;
    var stats = [
      [N, 'DSB FX templates'],
      [cs.total, 'legal CFI FX codes'],
      [qualified + ' / ' + N, 'have a CDM rule'],
      [M.fpmlAll.length, 'FpML FX elements'],
      [fiboExact + ' / ' + N, 'exact FIBO class'],
      [fiboAbsent, 'FIBO gaps'],
      [M.fiboStats.multiParent + ' / ' + M.fiboStats.classes, 'FIBO classes w/ 2+ parents']
    ];
    document.getElementById('statbar').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
  }

  function renderGaps() {
    var h = ['<h2>Where the standards do not line up</h2>',
      '<p>These are recorded rather than smoothed over. Each one is a place where a single ' +
      'canonical model has to make a choice and say so.</p>', '<div class="gapgrid">'];
    M.gaps.forEach(function (g) {
      h.push('<div class="gap"><h3>' + esc(g.title) + '</h3><p>' + esc(g.detail) + '</p>' +
        citeList(g.citations) + '</div>');
    });
    h.push('</div>');
    document.getElementById('gaps').innerHTML = h.join('');
  }

  function renderSources() {
    var h = ['<table><tr><th>Standard</th><th>Vendored at</th><th>Version</th></tr>'];
    M.meta.sources.forEach(function (s) {
      h.push('<tr><td>' + esc(s.standard) + '</td><td><code>' + esc(s.file) + '</code></td><td>' +
        esc(s.version) + '</td></tr>');
    });
    h.push('</table>');
    document.getElementById('sources').innerHTML = h.join('');
  }

  renderHub();
  renderLeaves();
  renderLanes();
  renderNarrow();
  renderLenses();
  renderRings();
  renderLensNote();
  renderStats();
  renderGaps();
  renderSources();
  // setView, not renderViews: the markup's initial hidden flags must be driven from
  // the `view` variable, or the default view and what is actually shown can disagree.
  setView(view);
})();
