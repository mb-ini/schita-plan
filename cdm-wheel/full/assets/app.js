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

  // ---- asset-class rails -------------------------------------------------------
  // The catalogue holds every leaf: 110 OTC products across six DSB asset classes and
  // 59 listed/cash CFI groups. One rail of 169 rows would put a listed bond next to an
  // inflation swap and compare nothing, so there is a rail per asset class and a switch.
  //
  // `M.products`, `M.lanes` and `M.lenses` are the ACTIVE rail, swapped by selectRail.
  // Threading a rail argument through every render function would have touched thirty
  // call sites to say the same thing.
  var CAT = {};
  (M.catalog || M.products).forEach(function (p) { CAT[p.id] = p; });
  var RAILS = (M.rails && M.rails.length) ? M.rails : [{
    id: 'Foreign_Exchange', title: 'Foreign exchange', kind: 'otc',
    leafOrder: M.leafOrder, leafCount: M.products.length,
    lanes: M.lanes, lenses: M.lenses
  }];
  var railIx = 0;
  for (var ri0 = 0; ri0 < RAILS.length; ri0++) {
    if (RAILS[ri0].id === M.defaultRail) { railIx = ri0; }
  }
  function rail() { return RAILS[railIx]; }

  // ---- deep links --------------------------------------------------------------
  // ?rail=Rates&view=lanes&theme=dark&row=3 selects a rail, a view, a theme and a row.
  // This is a real feature - a link to one asset class is the obvious thing to want to
  // send someone - and it is also what lets a screenshot be taken of a specific rail
  // without a harness file sitting next to the deliverable, which is how two test
  // harnesses ended up committed into it once before.
  var QS = {};
  (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
    if (!kv) { return; }
    var i = kv.indexOf('=');
    QS[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] =
      i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
  });
  if (QS.theme === 'dark' || QS.theme === 'light') {
    document.documentElement.setAttribute('data-theme', QS.theme);
  }
  for (var ri1 = 0; ri1 < RAILS.length; ri1++) {
    if (RAILS[ri1].id === QS.rail || RAILS[ri1].title === QS.rail) { railIx = ri1; }
  }

  function syncUrl() {
    if (!history.replaceState) { return; }
    // Relative URL only: a file:// page has no origin to build an absolute one from,
    // and the whole point of this artifact is that it opens off a disk.
    var q = '?rail=' + encodeURIComponent(rail().id) + '&view=' + encodeURIComponent(view);
    // The row and the theme round-trip, so a link copied out of the address bar shows
    // the reader what the sender was looking at rather than the rail's first row.
    if (pinned !== null) { q += '&row=' + pinned; }
    var theme = document.documentElement.getAttribute('data-theme');
    if (theme) { q += '&theme=' + encodeURIComponent(theme); }
    try { history.replaceState(null, '', q); } catch (e) { /* file:// may refuse */ }
  }

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
  // The rail column was fixed at 168px, which fits "Non Deliverable FX Swap" and runs
  // "Real estate investment trusts (REITs)" straight off the left edge of the page. The
  // ISO 10962 group names are much longer than the DSB product names, so the column is
  // measured per rail and the lanes give up the difference. The TOTAL stays fixed, because
  // that is what keeps the diagram rendering 1:1 at 1280 instead of being scaled down -
  // a scaled SVG shrinks its labels, which is how 6.6px text happened twice before.
  var LANES_TOTAL = 798;
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
    // The hub names the rail. It used to say "Foreign Exchange" in the source, which
    // was true of the only rail there was and would have been a lie on any other.
    var words = rail().title.split(' ');
    var line1 = words.length > 1 ? words.slice(0, -1).join(' ') : words[0];
    var line2 = words.length > 1 ? words[words.length - 1] : '';
    var t = el('text', { class: 'hublabel', 'text-anchor': 'middle', y: line2 ? -6 : 2 }, gHub);
    t.textContent = line1;
    if (line2) {
      var t2 = el('text', { class: 'hublabel', 'text-anchor': 'middle', y: 9 }, gHub);
      t2.textContent = line2;
    }
    var t3 = el('text', { class: 'hubsub', 'text-anchor': 'middle', y: 26 }, gHub);
    t3.textContent = N + (rail().kind === 'listed' ? ' CFI groups' : ' products');
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

  // ---- canonical layer lookups --------------------------------------------------
  // night-run/model/canonical.yaml, distilled into the model by gen_canonical.py. The
  // panel walks it one level into the payouts, which is far enough to show the
  // reset-convention path on an IRS without turning the panel into the whole schema.
  var CANON = M.canonical || null;
  var CANON_CLASS = {};
  var CANON_SLOT = {};
  if (CANON) {
    CANON.classes.forEach(function (c) { CANON_CLASS[c.name] = c; });
    CANON.slots.forEach(function (sl) { CANON_SLOT[sl.name] = sl; });
  }

  function mapChips(mappings) {
    if (!mappings || !mappings.length) {
      return '<span class="muted">no mapping asserted</span>';
    }
    // A mapping that says how sure it is should also be able to say why. The note is
    // written next to the mapping in canonical.yaml and travels with it.
    return mappings.map(function (m) {
      return '<span class="mapchip ' + esc(m.strength) + '"><b>' + esc(m.strength) +
        '</b> <code>' + esc(m.target) + '</code></span>' +
        (m.note ? '<span class="mapwhy">' + esc(m.note) + '</span>' : '');
    }).join(' ');
  }

  function canonRefs(item) {
    if (!item.refs || !item.refs.length) { return ''; }
    return citeList(item.refs.map(function (r) {
      var cut = r.at.lastIndexOf(':');
      var isLine = cut > 0 && /^\d+$/.test(r.at.slice(cut + 1));
      return { file: isLine ? r.at.slice(0, cut) : r.at,
               at: isLine ? 'line ' + r.at.slice(cut + 1) : r.standard };
    }));
  }

  function canonSlotRows(cls, depth) {
    // One row per slot, plus the slot's own mappings underneath it. A slot whose range
    // is another canonical class gets a link row, so the path is walkable.
    var rows = [];
    (cls.slots || []).forEach(function (name) {
      var sl = CANON_SLOT[name];
      if (!sl) { return; }
      var range = CANON_CLASS[sl.range]
        ? '<a href="#" class="canonlink" data-canon="' + esc(sl.range) + '">' + esc(sl.range) + '</a>'
        : '<code>' + esc(sl.range) + '</code>';
      rows.push('<tr><td><code>' + esc(sl.name) + '</code>' +
        (sl.required ? ' <span class="req">required</span>' : '') +
        (sl.multivalued ? ' <span class="muted">[]</span>' : '') +
        '</td><td>' + range + '</td><td>' + mapChips(sl.mappings) + '</td></tr>');
      if (sl.description) {
        rows.push('<tr><td></td><td colspan="2" class="muted" style="font-size:11px">' +
          esc(sl.description) + '</td></tr>');
      }
    });
    if (!rows.length) {
      return '<p class="muted">This class declares no slots of its own.</p>';
    }
    return '<table class="pos canonslots"><tr><th>Canonical slot</th><th>Range</th>' +
      '<th>Mapped to</th></tr>' + rows.join('') + '</table>';
  }

  function canonClassBlock(name, kind) {
    var cls = CANON_CLASS[name];
    if (!cls) { return '<p class="muted">' + esc(name) + ' is not in the canonical model.</p>'; }
    var h = [];
    h.push('<div class="canonclass" id="canon-' + esc(name) + '">');
    h.push('<div class="canonname"><strong>' + esc(cls.name) + '</strong>' +
      (cls.isA ? ' <span class="muted">is a</span> <a href="#" class="canonlink" data-canon="' +
        esc(cls.isA) + '">' + esc(cls.isA) + '</a>' : '') +
      (cls['abstract'] ? ' <span class="muted">(abstract)</span>' : '') +
      (kind ? ' <span class="canonrole">' + esc(kind) + '</span>' : '') + '</div>');
    if (cls.description) {
      h.push('<p class="muted" style="font-size:12px">' + esc(cls.description) + '</p>');
    }
    h.push('<p class="canonmaps">' + mapChips(cls.mappings) + '</p>');
    if (cls.note) { h.push('<p class="note">' + esc(cls.note) + '</p>'); }
    h.push(canonSlotRows(cls));
    h.push(canonRefs(cls));
    h.push('</div>');
    return h.join('');
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


    // --- the canonical layer, which is the only thing here we author -------
    if (CANON && p.canonical) {
      var cn = p.canonical;
      h.push('<div class="std canon"><h3>Canonical &middot; our model ' +
        badge(cn.method) + '</h3><div>');
      h.push('<p>In this model the product is ' +
        (/^[AEIOU]/.test(cn['class']) ? 'an' : 'a') + ' <strong>' + esc(cn['class']) +
        '</strong> whose classification is <code>' + esc(cn.classification.product_name) +
        '</code>' +
        (cn.payouts.length
          ? ' and whose structure is <strong>' + esc(cn.payouts.join(' + ')) + '</strong>.'
          : ', with no payout composition evidenced.') + '</p>');
      h.push('<p class="muted" style="font-size:11.5px">Authored in <code>' +
        esc(CANON.schema) + '</code>; the JSON Schema and pydantic classes under ' +
        '<code>night-run/model/generated/</code> are generated from it, twice and ' +
        'byte-compared. Classification is a field of the product, not its type &mdash; ' +
        'so a product can be reclassified without being restructured.</p>');
      if (cn.note) { h.push('<p class="note">' + esc(cn.note) + '</p>'); }
      h.push(canonClassBlock(cn['class'], 'the product'));
      cn.payouts.forEach(function (name) {
        h.push(canonClassBlock(name, 'payout'));
      });
      h.push('</div></div>');
    }

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
    // A range that is itself a canonical class is walkable: clicking it appends that
    // class's own block, which is how reset_dates -> ResetDates -> reset_frequency is
    // reached from an IRS without leaving the panel.
    var links = panelBody.querySelectorAll('a.canonlink');
    for (var li = 0; li < links.length; li++) {
      links[li].addEventListener('click', function (ev) {
        ev.preventDefault();
        var want = this.getAttribute('data-canon');
        var already = panelBody.querySelector('#canon-' + want);
        if (already) {
          already.classList.add('lit');
          already.scrollIntoView({ block: 'nearest' });
          return;
        }
        var holder = this.closest('.canonclass');
        if (!holder) { return; }
        var box = document.createElement('div');
        box.className = 'canonwalk';
        var from = holder.querySelector('.canonname strong');
        box.innerHTML = canonClassBlock(want, 'reached from ' + (from ? from.textContent : 'above'));
        holder.parentNode.insertBefore(box, holder.nextSibling);
        box.scrollIntoView({ block: 'nearest' });
      });
    }
    panelBody.hidden = false;
    panelEmpty.hidden = true;
  }

  // ---- lanes ------------------------------------------------------------------
  // One column per standard over the SAME fixed product rail. Row position encodes
  // product identity, so a row read across all five lanes is one product seen five ways.
  // Average glyph width of the rail label font, measured once from a rendered string
  // rather than guessed: a guess that is 10% low clips every long label.
  function railTextWidth(text) { return text.length * 6.15; }

  function fitRail(leaves) {
    var longest = 0;
    leaves.forEach(function (p) {
      longest = Math.max(longest, railTextWidth(p.upi.displayName || p.upi.product));
    });
    // 34px of padding leaves room for the instrument-type bracket on the left and the
    // 12px gutter on the right.
    var want = Math.ceil(longest) + 34;
    return Math.max(150, Math.min(318, want));
  }

  function truncateToFit(text, width) {
    if (railTextWidth(text) <= width) { return text; }
    var n = Math.max(4, Math.floor(width / 6.15) - 1);
    return text.slice(0, n).replace(/[\s(,.-]+$/, '') + '\u2026';
  }

  function renderLanes() {
    clear(gLanes);
    var L = M.lanes;
    RAIL_W = fitRail(M.products);
    LANE_W = Math.floor((LANES_TOTAL - RAIL_W - L.length * LANE_GAP) / L.length);
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
      var full = p.upi.displayName || p.upi.product.replace(/_/g, ' ');
      t.textContent = truncateToFit(full, RAIL_W - 46);
      if (t.textContent !== full) { el('title', {}, t).textContent = full; }

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
      // A rotated label needs the run to be tall enough to hold it. On the Other rail
      // every run is one or two rows and FORWARD collided with OPTION; the bracket still
      // shows the grouping, and the type is on every row's tooltip and in the panel.
      if (ri - runStart >= 2) {
        var bl = el('text', {
          class: 'railbracketlabel', 'text-anchor': 'middle',
          'dominant-baseline': 'central',
          transform: 'translate(13,' + fmt((yTop + yBot) / 2) + ') rotate(-90)'
        }, gLanes);
        var runType = M.products[runStart].upi.instrumentType.toUpperCase();
        var room = (yBot - yTop) - 8;
        bl.textContent = runType.length * 6.6 <= room
          ? runType
          : runType.slice(0, Math.max(3, Math.floor(room / 6.6)));
      }
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

  function renderTitles() {
    var r = rail();
    var h1 = document.getElementById('title');
    var sub = document.getElementById('subtitle');
    var intro = document.getElementById('panelIntro');
    var lanes = r.lanes.length;
    if (h1) { h1.textContent = r.title + ' \u2014 five standards, one leaf set'; }
    if (sub) {
      sub.textContent = r.kind === 'listed'
        ? r.leafCount + ' ISO 10962 groups outside the categories the OTC products occupy. ' +
          'UPI, FpML and CDM are not absent here \u2014 they were never in play.'
        : r.leafCount + ' ANNA-DSB ' + r.title + ' product templates, seen through ' +
          lanes + ' standards that disagree. Leaf positions never move; the rings do.';
    }
    if (intro) {
      intro.textContent = (r.kind === 'listed'
        ? 'The rim holds the ' + r.leafCount + ' ISO 10962 groups in scope. '
        : 'The rim holds the ' + r.leafCount + ' ' + r.title +
          ' product templates ANNA-DSB registers. ') +
        'Choosing one shows how all five standards describe it \u2014 and where they have ' +
        'nothing to say.';
    }
  }

  function renderRails() {
    var nav = document.getElementById('classes');
    if (!nav) { return; }
    clear(nav);
    RAILS.forEach(function (r, i) {
      var b = document.createElement('button');
      b.className = 'classbtn' + (r.kind === 'listed' ? ' listed' : '');
      b.type = 'button';
      b.textContent = r.title;
      b.setAttribute('aria-pressed', i === railIx ? 'true' : 'false');
      b.appendChild(document.createElement('span')).textContent = r.leafCount;
      b.addEventListener('click', function () { selectRail(i); });
      nav.appendChild(b);
    });
  }

  function selectRail(i) {
    railIx = i;
    var r = RAILS[i];
    M.products = r.leafOrder.map(function (id) { return CAT[id]; }).filter(Boolean);
    if (M.products.length !== r.leafCount) {
      document.body.textContent = 'rail ' + r.id + ' names ' + r.leafCount +
        ' leaves but the catalogue holds ' + M.products.length;
      return;
    }
    M.lanes = r.lanes;
    M.lenses = r.lenses;
    N = M.products.length;
    byId = {};
    M.products.forEach(function (p) { byId[p.id] = p; });
    lensIndex = 0;
    pinned = null;
    hovered = null;
    renderRails();
    renderTitles();
    pgFollowRail();
    renderHub();
    renderLeaves();
    renderLanes();
    renderNarrow();
    renderLenses();
    renderRings();
    renderLensNote();
    renderStats();
    hidePanel();
    paint();
    syncUrl();
  }


  // ---- classification rules, executed ------------------------------------------
  // The JavaScript half of the interpreter in night-run/build/rules.py. The two are not
  // trusted to agree: the builder runs a corpus of worked cases through the Python one
  // and stores the answers in M.ruleCases, check_model.py re-runs them there, and
  // check_render.js re-runs them HERE against the same stored answers. Any drift between
  // the two implementations shows up as a failing case rather than as a wrong answer in
  // the page.
  function classifyRules(rules, request) {
    var out = { matches: [], rule: null, missing: [], rejected: [], cfi: null, notes: [] };
    var kind = request && request.kind;

    if (kind === 'fpml') {
      var element = request.element;
      out.rule = 'fpml.productElement';
      var leaves = (rules.fpmlElementToLeaves || {})[element || ''] || [];
      out.matches = leaves.slice();
      if (!element) {
        out.notes.push('No product element was found in the document.');
      } else if (!leaves.length) {
        out.notes.push('No leaf in the catalogue claims the element ' + element + '.');
      } else if (leaves.length > 1) {
        out.notes.push('FpML element ' + element + ' covers ' + leaves.length +
          ' products; the element alone cannot choose between them.');
      }
      return out;
    }

    if (kind === 'cfi') {
      var code = String(request.code || '').trim().toUpperCase();
      out.rule = 'cfi.categoryGroup';
      if (code.length < 2) { out.missing.push('a CFI code of at least two characters'); return out; }
      var pair = code.slice(0, 2);
      var lid = (rules.cfiCodeToLeaf || {})[pair];
      if (lid) {
        out.matches = [lid];
        out.cfi = { code: code, categoryGroup: pair };
      } else {
        out.notes.push('Category and group ' + pair + ' is not a listed or cash leaf. The ' +
          'derivative categories are reached through their DSB products instead.');
      }
      return out;
    }

    if (kind !== 'terms') { out.notes.push('Unknown request kind.'); return out; }

    var asset = request.assetClass, itype = request.instrumentType;
    var given = {};
    var raw = request.attributes || {};
    Object.keys(raw).forEach(function (k) {
      if (raw[k] !== null && raw[k] !== undefined && raw[k] !== '') { given[k] = raw[k]; }
    });
    out.rule = 'upi.definingAttributes';
    if (!asset) { out.missing.push('Asset Class'); }
    if (!itype) { out.missing.push('Instrument Type'); }
    if (out.missing.length) { return out; }

    var byType = (rules.upiDefiningAttributes || {})[asset] || {};
    var candidates = byType[itype] || {};
    var ids = Object.keys(candidates).sort();
    if (!ids.length) {
      out.notes.push('ANNA-DSB registers no ' + itype + ' product in ' + asset + '.');
      return out;
    }

    var surviving = [];
    ids.forEach(function (lid) {
      var defining = candidates[lid], ok = true;
      Object.keys(given).sort().forEach(function (name) {
        if (!ok) { return; }
        var allowed = defining[name];
        if (allowed === undefined) { return; }
        if (allowed.indexOf(given[name]) < 0) {
          ok = false;
          out.rejected.push({ leaf: lid, attribute: name, value: given[name] });
        }
      });
      if (ok) { surviving.push(lid); }
    });
    out.matches = surviving;

    if (surviving.length > 1) {
      var names = {};
      surviving.forEach(function (lid) {
        Object.keys(candidates[lid]).forEach(function (n) { names[n] = 1; });
      });
      var discriminating = Object.keys(names).sort().filter(function (name) {
        if (given.hasOwnProperty(name)) { return false; }
        var seen = {};
        surviving.forEach(function (lid) {
          seen[JSON.stringify(candidates[lid][name] || [])] = 1;
        });
        return Object.keys(seen).length > 1;
      });
      out.missing = discriminating;
      out.notes.push(discriminating.length
        ? surviving.length + ' products still match. The attributes that would tell them ' +
          'apart are listed as missing.'
        : surviving.length + ' products match and no UPI-defining attribute distinguishes ' +
          'them; they differ outside the UPI layer.');
    }

    if (surviving.length === 1) {
      var only = surviving[0];
      var chars = (rules.cfiCharacterFromAttribute || {})[only] || {};
      var mask = rules.leafIndex[only].cfiMask;
      var codeChars = mask.split('');
      var pinned = [];
      ['3', '4', '5', '6'].forEach(function (pos) {
        var spec = chars[pos];
        if (!spec) { return; }
        var value = given[spec.attribute];
        var letter = value ? (spec.values || {})[value] : null;
        if (letter) {
          codeChars[parseInt(pos, 10) - 1] = letter;
          pinned.push({ position: parseInt(pos, 10), attribute: spec.attribute,
                        value: value, letter: letter });
        }
      });
      out.cfi = { code: codeChars.join(''), fromMask: mask, pinned: pinned,
                  categoryGroup: mask.slice(0, 2) };
    }
    return out;
  }

  // The checkers reach the interpreter through this; the page itself uses it directly.
  window.NIGHT_WHEEL_CLASSIFY = classifyRules;


  // ---- term-level validation ---------------------------------------------------
  // The mirror of `missing_required` in night-run/build/rules.py. The required-field
  // lists are read off the block graph, which is what the generated JSON Schemas were
  // generated from, so the page reports the schema's own `required` without shipping
  // 1.4MB of schema files. Both halves are compared on M.docCases by the two checkers.
  function missingRequired(rootBlock, present) {
    var block = BLOCKS[rootBlock];
    if (!block) {
      return { missing: [], unexpected: present.slice().sort(), known: [],
               note: 'no root block, so nothing is required' };
    }
    var known = block.fields.map(function (f) { return f.name; });
    var required = block.fields.filter(function (f) {
      return f.fpml.min !== '0' && f.fpml.min !== '';
    }).map(function (f) { return f.name; });
    return {
      missing: required.filter(function (n) { return present.indexOf(n) < 0; }).sort(),
      unexpected: present.filter(function (n) { return known.indexOf(n) < 0; }).sort(),
      known: known.filter(function (n) { return present.indexOf(n) >= 0; }).sort(),
      note: '',
    };
  }

  // The immediate children of the product element: exactly as deep as the emitted
  // schema goes, so a missing field means "the schema wants this at this level".
  function topLevelElements(xml, element) {
    var open = new RegExp('<(?:[A-Za-z0-9_]+:)?' + element + '[\\s>]');
    var m = open.exec(xml);
    if (!m) { return []; }
    var re = /<(\/?)(?:[A-Za-z0-9_]+:)?([A-Za-z][A-Za-z0-9]*)([^>]*)>/g;
    re.lastIndex = m.index + m[0].length;
    var depth = 0, found = [], tm;
    while ((tm = re.exec(xml))) {
      var closing = tm[1], name = tm[2], rest = tm[3];
      if (closing) {
        if (depth === 0) { break; }
        depth--;
        continue;
      }
      if (/\/\s*$/.test(rest)) {
        if (depth === 0 && found.indexOf(name) < 0) { found.push(name); }
        continue;
      }
      if (depth === 0 && found.indexOf(name) < 0) { found.push(name); }
      depth++;
    }
    return found;
  }

  window.NIGHT_WHEEL_VALIDATE = missingRequired;

  // ---- the playground ----------------------------------------------------------
  var pgMode = 'terms';

  function pgProductElement(xml) {
    // Only the product element is read, by local name, because namespace prefixes vary
    // between documents and the element set is already known from the XSDs.
    var known = M.rules && M.rules.fpmlElementToLeaves ? M.rules.fpmlElementToLeaves : {};
    var re = /<(?:[A-Za-z0-9_]+:)?([A-Za-z][A-Za-z0-9]*)[\s>\/]/g;
    var m;
    while ((m = re.exec(xml))) {
      if (known.hasOwnProperty(m[1])) { return m[1]; }
    }
    return null;
  }

  function pgRequest() {
    if (pgMode === 'fpml') {
      return { kind: 'fpml', element: pgProductElement(document.getElementById('pgXml').value || '') };
    }
    if (pgMode === 'cfi') {
      return { kind: 'cfi', code: document.getElementById('pgCode').value || '' };
    }
    var attrs = {};
    [].slice.call(document.querySelectorAll('#pgAttrs select')).forEach(function (sel) {
      if (sel.value) { attrs[sel.getAttribute('data-attr')] = sel.value; }
    });
    return {
      kind: 'terms',
      assetClass: document.getElementById('pgAsset').value,
      instrumentType: document.getElementById('pgType').value,
      attributes: attrs
    };
  }

  function pgRenderResult(res, request) {
    var idx = M.rules.leafIndex;
    var h = [];
    h.push('<div class="pgrule">Rule applied: <code>' + esc(res.rule || 'none') + '</code></div>');
    if (res.matches.length) {
      h.push('<h3>' + res.matches.length +
        (res.matches.length === 1 ? ' product matches' : ' products match') + '</h3><ul class="pgmatches">');
      res.matches.slice(0, 30).forEach(function (lid) {
        var L = idx[lid] || { name: lid, cfiMask: '', assetClass: '' };
        h.push('<li><b>' + esc(L.name) + '</b> <span class="muted">' + esc(L.assetClass) +
          '</span> <code>' + esc(L.cfiMask) + '</code></li>');
      });
      if (res.matches.length > 30) { h.push('<li class="muted">…</li>'); }
      h.push('</ul>');
    } else {
      h.push('<h3>No product matches</h3>');
    }
    if (res.cfi) {
      h.push('<div class="pgcfi">CFI <code>' + esc(res.cfi.code) + '</code>');
      if (res.cfi.pinned && res.cfi.pinned.length) {
        h.push('<ul class="pgpinned">');
        res.cfi.pinned.forEach(function (p) {
          h.push('<li>character ' + p.position + ' = <code>' + esc(p.letter) + '</code> from ' +
            esc(p.attribute) + ' = ' + esc(p.value) + '</li>');
        });
        h.push('</ul>');
      }
      h.push('</div>');
    }
    if (res.missing.length) {
      h.push('<div class="pgmissing"><b>Missing</b><ul><li>' +
        res.missing.map(esc).join('</li><li>') + '</li></ul></div>');
    }
    if (res.rejected.length) {
      h.push('<div class="muted">' + res.rejected.length +
        ' product(s) ruled out by a value outside their enum.</div>');
    }
    res.notes.forEach(function (n) { h.push('<p class="pgnote">' + esc(n) + '</p>'); });
    // What the other standards say about a single match, from the catalogue rather than
    // from a rule: CDM's qualification functions are predicates over payout composition
    // and are not executed here.
    // For a pasted document, also validate its terms against the product's schema.
    if (pgMode === 'fpml' && res.matches.length && request && request.element) {
      var xml = (document.getElementById('pgXml') || {}).value || '';
      var subject = CAT[res.matches[0]];
      var rootBlock = subject && subject.composition && subject.composition.rootBlock;
      if (rootBlock && xml) {
        var present = topLevelElements(xml, request.element);
        var v = missingRequired(rootBlock, present);
        h.push('<div class="pgvalid"><b>Validation against <code>' + esc(rootBlock) +
          '</code></b>');
        h.push('<p class="muted">' + present.length + ' element(s) at the document\'s top ' +
          'level; ' + v.known.length + ' of them are fields of this block.</p>');
        if (v.missing.length) {
          h.push('<p class="pgerr">Required by the schema and not present: <b>' +
            v.missing.map(esc).join('</b>, <b>') + '</b></p>');
        } else {
          h.push('<p class="pgok">Every required field of the root block is present.</p>');
        }
        if (v.unexpected.length) {
          h.push('<p class="muted">Not fields of this block: ' +
            v.unexpected.slice(0, 12).map(esc).join(', ') +
            (v.unexpected.length > 12 ? ' …' : '') +
            '. Most will be FpML envelope elements rather than product terms.</p>');
        }
        h.push('<p class="muted">The schema is generated from the same block graph; see ' +
          '<code>night-run/schema/</code>.</p></div>');
      }
    }

    if (res.matches.length === 1 && CAT[res.matches[0]]) {
      var leaf = CAT[res.matches[0]];
      h.push('<div class="pgstandards"><b>What the other standards say about it</b><ul>');
      [['FpML', leaf.fpml.elements.map(function (e) { return e.element; }).join(' + ') || 'none',
        leaf.fpml.method],
       ['CDM', leaf.cdm.functions.map(function (f) { return f.qualificationFunction; }).join(' + ')
        || 'none', leaf.cdm.method],
       ['FIBO', leaf.fibo.class ? leaf.fibo.class.localName : 'none', leaf.fibo.method]
      ].forEach(function (row) {
        h.push('<li>' + esc(row[0]) + ': ' + esc(row[1]) +
          ' <span class="badge ' + esc(row[2]) + '">' + esc(row[2]) + '</span></li>');
      });
      h.push('</ul><p class="muted">Read from the catalogue, not re-derived. CDM qualifies ' +
        'by payout composition, which is a predicate over a trade this page does not have.' +
        '</p></div>');
    }
    document.getElementById('pgResult').innerHTML = h.join('');
  }

  function pgRun() {
    var request = pgRequest();
    pgRenderResult(classifyRules(M.rules, request), request);
  }

  function pgFillAttrs() {
    var box = document.getElementById('pgAttrs');
    clear(box);
    var asset = document.getElementById('pgAsset').value;
    var itype = document.getElementById('pgType').value;
    var candidates = ((M.rules.upiDefiningAttributes || {})[asset] || {})[itype] || {};
    var names = {};
    Object.keys(candidates).forEach(function (lid) {
      Object.keys(candidates[lid]).forEach(function (n) {
        names[n] = (names[n] || []).concat(candidates[lid][n]);
      });
    });
    Object.keys(names).sort().forEach(function (name) {
      // Asset Class and Instrument Type are UPI-defining, and they are also the two
      // selectors above. Rendering them again asks the same question twice and lets the
      // two answers disagree.
      if (name === 'Asset Class' || name === 'Instrument Type') { return; }
      var values = names[name].filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
      var lab = document.createElement('label');
      lab.textContent = name + ' ';
      var sel = document.createElement('select');
      sel.setAttribute('data-attr', name);
      var blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '(not given)';
      sel.appendChild(blank);
      values.forEach(function (v) {
        var o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
      sel.addEventListener('change', pgRun);
      lab.appendChild(sel);
      box.appendChild(lab);
    });
    pgRun();
  }

  function pgFillTypes() {
    var asset = document.getElementById('pgAsset').value;
    var sel = document.getElementById('pgType');
    clear(sel);
    Object.keys((M.rules.upiDefiningAttributes || {})[asset] || {}).sort().forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    pgFillAttrs();
  }

  // The playground follows the rail, because the question "what is this trade" is nearly
  // always about the asset class already on screen.
  function pgFollowRail() {
    var sel = document.getElementById('pgAsset');
    if (!sel || !sel.options || !sel.options.length) { return; }
    var want = rail().id;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === want && sel.value !== want) {
        sel.value = want;
        pgFillTypes();
        return;
      }
    }
  }

  function renderPlayground() {
    if (!M.rules || !document.getElementById('playground')) { return; }
    var modes = document.getElementById('pgmodes');
    clear(modes);
    [['terms', 'Terms of a trade'], ['fpml', 'FpML document'], ['cfi', 'CFI code']]
      .forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pgmode';
        b.textContent = m[1];
        b.setAttribute('aria-pressed', pgMode === m[0] ? 'true' : 'false');
        b.addEventListener('click', function () {
          pgMode = m[0];
          document.getElementById('pgterms').hidden = (pgMode !== 'terms');
          document.getElementById('pgfpml').hidden = (pgMode !== 'fpml');
          document.getElementById('pgcfi').hidden = (pgMode !== 'cfi');
          renderPlayground();
          pgRun();
        });
        modes.appendChild(b);
      });

    var asset = document.getElementById('pgAsset');
    if (!asset.options.length) {
      Object.keys(M.rules.upiDefiningAttributes || {}).sort().forEach(function (a) {
        var o = document.createElement('option');
        o.value = a;
        o.textContent = a.replace(/_/g, ' ');
        asset.appendChild(o);
      });
      asset.addEventListener('change', pgFillTypes);
      document.getElementById('pgType').addEventListener('change', pgFillAttrs);
      document.getElementById('pgXml').addEventListener('input', pgRun);
      document.getElementById('pgCode').addEventListener('input', pgRun);
      pgFillTypes();
      // selectRail ran before these options existed, so the follow has to happen here
      // too or the playground opens on whichever asset class sorts first.
      pgFollowRail();
    }

    var cases = M.ruleCases || [];
    document.getElementById('pgCasesSummary').textContent =
      'Worked cases (' + cases.length + ') — every one re-run by both checkers';
    var ch = ['<ul class="pgcaselist">'];
    cases.forEach(function (c) {
      var names = c.expected.matches.map(function (l) {
        return (M.rules.leafIndex[l] || {}).name || l;
      });
      ch.push('<li><button type="button" class="pgcase" data-case="' + esc(c.id) + '">' +
        esc(c.title) + '</button><br><span class="muted"><code>' + esc(c.expected.rule) +
        '</code> → ' + esc(names.slice(0, 3).join(', ') || 'no match') +
        (names.length > 3 ? ' +' + (names.length - 3) : '') + '</span></li>');
    });
    ch.push('</ul>');
    var box = document.getElementById('pgCases');
    box.innerHTML = ch.join('');
    [].slice.call(box.querySelectorAll('.pgcase')).forEach(function (b) {
      b.addEventListener('click', function () {
        var c = cases.filter(function (x) { return x.id === b.getAttribute('data-case'); })[0];
        if (!c) { return; }
        pgRenderResult(classifyRules(M.rules, c.request), c.request);
        document.getElementById('pgResult').scrollIntoView
          && document.getElementById('pgResult').scrollIntoView({ block: 'nearest' });
      });
    });
  }


  // ---- blocks view -------------------------------------------------------------
  // The composition graph, read out of the FpML schema at build time. A block appears
  // once and lists every product that reaches it, which is what makes it worth drawing:
  // `ResetDates` is one node used by 29 products, not 29 copies of the same seven fields.
  var BLOCKS = {};
  (M.blocks || []).forEach(function (b) { BLOCKS[b.id] = b; });
  var openBlock = null;

  function blockSubjectIndex() {
    // Whichever product is pinned, else hovered, else the first on the rail that has a
    // composition at all. Falling back to index 0 opened the view empty on any rail whose
    // first product has no FpML element - true, and a blank page as an introduction to
    // the layer.
    if (pinned !== null && M.products[pinned]) { return pinned; }
    if (hovered !== null && M.products[hovered]) { return hovered; }
    for (var i = 0; i < M.products.length; i++) {
      var c = M.products[i].composition;
      if (c && c.rootBlock) { return i; }
    }
    return 0;
  }

  function renderBlockTree() {
    var host = document.getElementById('blocktree');
    if (!host) { return; }
    clear(host);
    host.innerHTML = '';
    var p = M.products[blockSubjectIndex()];
    var intro = document.getElementById('blocksintro');
    if (!p) { return; }
    var comp = p.composition || { rootBlock: null, blocks: [], fieldCount: 0 };
    if (intro) {
      // The listed half is decomposed from ESMA's FIRDS record, not from FpML, so the
      // sentence has to name the schema it actually read rather than assuming one.
      var fromIso = comp.method === 'iso20022-firds-record';
      intro.innerHTML = comp.rootBlock
        ? '<b>' + esc(p.upi.qualifiedName) + '</b> is built from <b>' + comp.blockCount +
          '</b> blocks carrying <b>' + comp.fieldCount + '</b> fields, read from ' +
          (fromIso
            ? "ESMA's FIRDS reference-data record <code>" + esc(comp.rootBlock) + '</code>' +
              ' &mdash; FpML has no product element for trading a cash instrument'
            : 'the FpML element <code>' +
              esc((p.fpml.elements[0] || {}).element || '') + '</code>, whose type is ' +
              '<code>' + esc(comp.rootBlock) + '</code>') +
          '. A block shared with other products is marked; it is one node, not a copy. ' +
          'These blocks are the <em>provenance</em>: what each standard declares, in its own ' +
          'names. The canonical model built on top of them &mdash; 29 classes rather than ' +
          (M.blockStats ? M.blockStats.blocks : 'these') + ' &mdash; is at the top of the ' +
          'panel on the right, and cites these lines.'
        : '<b>' + esc(p.upi.qualifiedName) + '</b> has no product element in either schema, ' +
          'so there is no composition to read. ' + esc(comp.note || '');
      // FIBO states what a class HAS through owl:Restriction rather than rdfs:domain, so
      // these are the nearest thing it has to fields - and they are the other half of
      // what the brief asks for alongside the ISO 20022 fields.
      var fc = p.fibo && p.fibo.class;
      if (fc && fc.propertyCount) {
        intro.innerHTML += '<br><span class="fiboprops">FIBO <code>' +
          esc(fc.localName) + '</code> states ' + fc.propertyCount + ' propert' +
          (fc.propertyCount === 1 ? 'y' : 'ies') + ' through owl:Restriction: ' +
          fc.properties.slice(0, 8).map(function (q) {
            return '<code>' + esc(q.localName) + '</code>';
          }).join(', ') + (fc.propertyCount > 8 ? ' …' : '') +
          ' <span class="muted">(' + esc(fc.module || '') + ')</span></span>';
      }
    }
    if (!comp.rootBlock) { return; }

    var seen = {};
    var rows = [];
    (function walk(id, depth) {
      if (depth > 3 || seen[id]) { return; }
      seen[id] = true;
      var b = BLOCKS[id];
      if (!b) { return; }
      rows.push({ block: b, depth: depth });
      b.subBlocks.forEach(function (sub) {
        if (BLOCKS[sub] && comp.blocks.indexOf(sub) >= 0) { walk(sub, depth + 1); }
      });
    })(comp.rootBlock, 0);

    var h = ['<ul class="btree">'];
    rows.forEach(function (r) {
      var b = r.block;
      h.push('<li class="btreeitem d' + r.depth + (openBlock === b.id ? ' open' : '') + '">' +
        '<button type="button" class="bnode" data-block="' + esc(b.id) + '">' +
        '<span class="bname">' + esc(b.name) + '</span>' +
        '<span class="bmeta">' + b.fieldCount + ' fields' +
        (b.shared ? ' · shared by ' + b.usedBy.length : '') +
        (b.truncated ? ' · cut at depth cap' : '') + '</span></button></li>');
    });
    h.push('</ul>');
    host.innerHTML = h.join('');
    [].slice.call(host.querySelectorAll('.bnode')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        openBlock = btn.getAttribute('data-block');
        renderBlockTree();
        renderBlockDetail();
      });
    });
    if (!openBlock || !BLOCKS[openBlock] || comp.blocks.indexOf(openBlock) < 0) {
      openBlock = comp.rootBlock;
    }
    renderBlockDetail();
  }

  function renderBlockDetail() {
    var host = document.getElementById('blockdetail');
    if (!host) { return; }
    var b = BLOCKS[openBlock];
    if (!b) { host.innerHTML = ''; return; }
    var h = [];
    h.push('<h3>' + esc(b.name) + '</h3>');
    if (b.doc) { h.push('<p class="bdoc">' + esc(b.doc) + '</p>'); }
    h.push('<p class="bcite">declared at <code>' + esc(b.file) + '</code> line ' + b.line +
      (b.base ? ', extending <code>' + esc(b.base) + '</code>' : '') + '</p>');
    h.push('<p class="bcite">CDM: ' + (b.cdm.type
      ? '<code>' + esc(b.cdm.type) + '</code> at <code>' + esc(b.cdm.file) + '</code> line ' +
        b.cdm.line + ' <span class="badge ' + esc(b.cdm.method) + '">' + esc(b.cdm.method) +
        '</span>'
      : '<span class="badge absent">absent</span> — CDM has no type of this name') + '</p>');

    h.push('<p class="bcite">Used by ' + b.usedBy.length + ' product' +
      (b.usedBy.length === 1 ? '' : 's') + ': ' +
      b.usedBy.slice(0, 8).map(function (id) {
        return esc(((M.rules && M.rules.leafIndex[id]) || {}).name || id);
      }).join(', ') + (b.usedBy.length > 8 ? ' …' : '') + '</p>');

    var schemaName = b.schema === 'iso20022' ? 'ISO 20022 type' : 'FpML type';
    h.push('<table class="bfields"><thead><tr><th>Field</th><th>' + esc(schemaName) +
      '</th><th>Card.</th><th>CDM attribute</th><th>DSB</th></tr></thead><tbody>');
    b.fields.forEach(function (f) {
      var cdm = f.cdm.attribute
        ? esc(f.cdm.attribute) + ' <span class="muted">(' + esc(f.cdm.cardinality) +
          ', line ' + f.cdm.line + ')</span>'
        : '<span class="badge absent">absent</span>';
      var dsb = (f.dsb && f.dsb.matchCount)
        ? esc(f.dsb.matches[0].attribute) +
          (f.dsb.matchCount > 1 ? ' <span class="muted">×' + f.dsb.matchCount + '</span>' : '')
        : '<span class="muted">—</span>';
      h.push('<tr><td><b>' + esc(f.name) + '</b>' +
        (f.fpml.inherited ? ' <span class="muted">from ' + esc(f.fpml.declaredIn) + '</span>' : '') +
        (f.fpml.doc ? '<div class="fdoc">' + esc(f.fpml.doc) + '</div>' : '') + '</td>' +
        '<td>' + (f.isBlock
          ? '<button type="button" class="blink" data-block="' + esc(f.fpml.type) + '">' +
            esc(f.fpml.qname) + '</button>'
          : '<code>' + esc(f.fpml.qname) + '</code>') + '</td>' +
        '<td>' + esc(f.fpml.min) + '..' + esc(f.fpml.max) + '</td>' +
        '<td>' + cdm + '</td><td>' + dsb + '</td></tr>');
    });
    h.push('</tbody></table>');
    h.push('<p class="bcite">Every line number above is a line in the vendored file named ' +
      'beside it; <code>night-run/build/check_model.py</code> opens each one.</p>');
    host.innerHTML = h.join('');
    [].slice.call(host.querySelectorAll('.blink')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-block');
        if (BLOCKS[id]) { openBlock = id; renderBlockTree(); }
      });
    });
  }

  function renderViews() {
    var nav = document.getElementById('views');
    clear(nav);
    [['wheel', 'Wheel'], ['lanes', 'Lanes'], ['blocks', 'Blocks']].forEach(function (v) {
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
    document.getElementById('blocksview').hidden = (v !== 'blocks');
    document.getElementById('lenses').hidden = (v !== 'wheel');
    document.getElementById('hint').textContent =
      v === 'wheel'
        ? 'Hover or focus a product on the rim. Arrow keys move around the rim; Enter pins a product; Escape unpins.'
        : v === 'blocks'
          ? 'The blocks this product is built from, read out of the schema that models it. Pin a product in the lanes or the wheel to change the subject.'
          : 'Each row is one product seen five ways. Hover a row to read it across every standard; click to pin.';
    if (v === 'blocks') { renderBlockTree(); }
    renderViews();
    paint();
    syncUrl();
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
    // Read off the active rail's own lanes rather than recomputed here, so the numbers
    // in the stat bar and the marks in the lanes cannot disagree. "n/a" is reported
    // separately from coverage: a standard that was never in play is not a gap.
    var stats = [[N, rail().kind === 'listed' ? 'CFI groups in scope' : 'DSB product templates']];
    M.lanes.forEach(function (L) {
      var na = L.notApplicable || 0;
      stats.push([L.covered + ' / ' + (N - na),
                  L.title + (na ? ' (' + na + ' n/a)' : '')]);
    });
    if (rail().id === 'Foreign_Exchange' && M.meta.cfiFxCodeSpace) {
      stats.push([M.meta.cfiFxCodeSpace.total, 'legal CFI FX codes']);
    }
    stats.push([M.fiboStats.multiParent + ' / ' + M.fiboStats.classes,
                'FIBO classes w/ 2+ parents']);
    document.getElementById('statbar').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
  }

  // These six were written about the FX slice in an earlier milestone and are true of
  // it. Shown under a heading that does not say so, on a rail about something else, they
  // read as claims about that rail.
  function renderGaps() {
    var h = ['<h2>Where the standards do not line up &mdash; the FX slice</h2>',
      '<p>These are recorded rather than smoothed over. Each one is a place where a single ' +
      'canonical model has to make a choice and say so. They were traced product by ' +
      'product for <b>foreign exchange</b>, which is the slice that has been audited to ' +
      'that depth; the other rails have the same kind of disagreement and it is visible ' +
      'in their lanes as <code>broader</code>, <code>narrower</code> and ' +
      '<code>absent</code> rather than written up here.</p>', '<div class="gapgrid">'];
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

  // selectRail, not the individual renders: the default rail has to be *applied*, not
  // assumed to match whatever the data happens to hold - the same mistake that once left
  // the default view variable and the visible view disagreeing.
  if (QS.view === 'wheel' || QS.view === 'lanes' || QS.view === 'blocks') { view = QS.view; }
  selectRail(railIx);
  // ?row=N opens that row's panel, counted within the selected rail. Out of range is
  // ignored rather than clamped: a link to row 40 of a 27-row rail is a broken link, and
  // silently showing row 26 would hide that.
  if (QS.row !== undefined && /^\d+$/.test(QS.row)) {
    var want = parseInt(QS.row, 10);
    if (want < M.products.length) {
      pinned = want;
      showPanel(want);
      paint();   // reads `pinned` and lights the wheel, the lanes and the rim together
      syncUrl();
    }
  }
  renderPlayground();
  renderGaps();
  renderSources();
  // setView, not renderViews: the markup's initial hidden flags must be driven from
  // the `view` variable, or the default view and what is actually shown can disagree.
  setView(view);
})();
