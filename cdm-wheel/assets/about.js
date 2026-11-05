/* "About this page" tab, shared by the 17-product page and the 169-product page.
   It runs after app.js and leaves it untouched. Anything in About that can be read from
   the page's own data (counts, standards, link strengths, coverage) is filled in from
   window.NIGHT_WHEEL here, so it cannot drift from what the page shows. Everything else
   is guarded by tools/check-about.cjs: it fails when a file About describes changes
   without About being reviewed, or when About names a control the page does not have. */
(function () {
  'use strict';
  var M = window.NIGHT_WHEEL || {};
  var about = document.getElementById('about');
  var btn = document.getElementById('aboutbtn');
  var views = document.getElementById('views');
  if (!about || !btn || !views) return;
  // app.js rewrites the address bar on load (?rail=..&view=..), so read the URL the
  // reader actually opened, captured by an inline script before app.js ran.
  var opened = window.__aboutOpenedUrl || window.location.href;

  // ---- facts from the data -------------------------------------------------------
  var STRENGTHS = [
    ['exact', 'the standard says the same thing, confirmed against the cited line'],
    ['evidenced-name', 'the two names are made of the same words'],
    ['evidenced-sample', 'one of the standard’s own sample trades shows it'],
    ['editorial', 'a judgement call, with a citation and a written reason'],
    ['broader', 'the standard’s term is true but says less than the product'],
    ['narrower', 'the standard’s term says more than the product; usually several qualify'],
    ['absent', 'the standard could have answered and does not'],
    ['not-applicable', 'the standard does not cover this kind of product, so nothing was asked']
  ];

  function lanes() {
    var out = [];
    var rails = (M.rails && M.rails.length) ? M.rails : [{ lanes: M.lanes || [] }];
    rails.forEach(function (r) { (r.lanes || []).forEach(function (L) { out.push(L); }); });
    return out;
  }

  function usedStrengths() {
    var seen = {};
    lanes().forEach(function (L) {
      (L.rows || []).forEach(function (row) { if (row.strength) seen[row.strength] = true; });
    });
    return seen;
  }

  function num(n) { return (typeof n === 'number') ? n.toLocaleString('en-US') : undefined; }
  function titles(list) {
    return (list && list.length) ? list.map(function (x) { return x.title; }).join(', ') : undefined;
  }

  var cs = (M.canonical && M.canonical.stats) || {};
  var bs = M.blockStats || {};
  var facts = {
    products: num((M.catalog || M.products || []).length || undefined),
    otc: num(cs.otc),
    listed: num(cs.listed),
    assetClasses: num(M.rails ? M.rails.length : undefined),
    standards: num((M.lanes || []).length || undefined),
    laneNames: titles(M.lanes),
    lensNames: titles(M.lenses),
    blocks: num(bs.blocks),
    fields: num(bs.fields),
    maxDepth: num(bs.maxDepth),
    canonClasses: num(cs.classes),
    canonSlots: num(cs.slots),
    canonEnums: num(cs.enums)
  };

  Array.prototype.forEach.call(about.querySelectorAll('[data-fact]'), function (el) {
    var v = facts[el.getAttribute('data-fact')];
    if (v === undefined || v === '') { el.textContent = '?'; el.classList.add('missing'); }
    else el.textContent = v;
  });

  Array.prototype.forEach.call(about.querySelectorAll('[data-legend]'), function (ul) {
    var used = usedStrengths();
    var known = {};
    STRENGTHS.forEach(function (s) {
      known[s[0]] = true;
      if (!used[s[0]]) return;
      var li = document.createElement('li');
      li.innerHTML = '<span class="dot ' + s[0] + '"></span><span class="name">' + s[0] +
        '</span><span>' + s[1] + '</span>';
      ul.appendChild(li);
    });
    Object.keys(used).forEach(function (k) {
      if (known[k]) return;
      var li = document.createElement('li');
      li.className = 'missing';
      li.textContent = k + ': used by the page but not explained here';
      ul.appendChild(li);
    });
  });

  Array.prototype.forEach.call(about.querySelectorAll('[data-coverage]'), function (box) {
    if (!M.coverage || !M.coverage.length) { box.textContent = '?'; box.classList.add('missing'); return; }
    var order = [['upi', 'UPI'], ['cfi', 'CFI'], ['cdm', 'CDM'], ['fpml', 'FpML'], ['fibo', 'FIBO']];
    var tot = {}, leaves = 0;
    M.coverage.forEach(function (c) {
      leaves += c.leaves || 0;
      Object.keys(c.standards || {}).forEach(function (k) {
        var s = c.standards[k], t = tot[k] || (tot[k] = { covered: 0, na: 0, absent: 0 });
        t.covered += s.covered || 0; t.na += s.notApplicable || 0; t.absent += s.absent || 0;
      });
    });
    var h = ['<table class="cov"><thead><tr><th>Standard</th><th>answers</th>' +
      '<th>not applicable</th><th>could answer, does not</th></tr></thead><tbody>'];
    order.forEach(function (o) {
      var t = tot[o[0]];
      if (!t) return;
      h.push('<tr><td>' + o[1] + '</td><td>' + t.covered + '</td><td>' + t.na + '</td><td>' +
        t.absent + '</td></tr>');
    });
    h.push('</tbody></table><p class="small">Out of ' + leaves + ' products, counted from the ' +
      'page’s own data.</p>');
    box.innerHTML = h.join('');
  });

  // ---- switching between About and the explorer ------------------------------------
  function viewButtons() { return views.querySelectorAll('button'); }
  function label(v) { return v.charAt(0).toUpperCase() + v.slice(1); }

  function open() {
    about.hidden = false;
    document.body.classList.add('about-open');
    btn.setAttribute('aria-pressed', 'true');
    Array.prototype.forEach.call(viewButtons(), function (b) { b.setAttribute('aria-pressed', 'false'); });
  }

  function close() {
    about.hidden = true;
    document.body.classList.remove('about-open');
    btn.setAttribute('aria-pressed', 'false');
  }

  // Leave About through the explorer's own buttons, so app.js stays the only place that
  // decides which view is shown and how its switches look.
  function go(view) {
    close();
    var target = null;
    Array.prototype.forEach.call(viewButtons(), function (b) {
      if (b.textContent === label(view)) target = b;
    });
    if (target) target.click();
    window.scrollTo(0, 0);
  }

  btn.addEventListener('click', function () {
    if (about.hidden) { open(); window.scrollTo(0, 0); }
  });
  // app.js re-renders its buttons on every switch, so listen on the container.
  views.addEventListener('click', function (e) {
    if (e.target.closest('button') && !about.hidden) close();
  }, true);
  about.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (b) go(b.getAttribute('data-go'));
  });

  // A plain link opens on About. #lanes / #wheel / #blocks, or a link copied from the
  // address bar (?view=...), opens that view directly.
  var u = opened.split('#');
  var hash = (u[1] || '').toLowerCase();
  var qview = (/[?&]view=([a-z]+)/.exec(u[0]) || [])[1];
  var wanted = hash || qview;
  var exists = false;
  Array.prototype.forEach.call(viewButtons(), function (b) {
    if (wanted && b.textContent === label(wanted)) exists = true;
  });
  if (exists) go(wanted); else open();
})();
