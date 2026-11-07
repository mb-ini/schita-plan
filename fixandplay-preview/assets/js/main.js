/* Fix & Play Service GSM: small vanilla helpers. No tracking, no cookies, no storage.
   - WhatsApp forms: compose a message and open wa.me. Nothing is sent to any server.
   - Price search: filters the inline JSON in #price-data.
   - TikTok: the player loads only after a click (click-to-load facade).
   - Review mode (team only): ?review in the URL highlights the .pending texts and keeps ?review on internal links.
   - Owner comments (only with a key, ?review=<KEY>): "Marchează" (tap any part of the page, write, a
     numbered pin stays there), "Răspunde" on each .pending text, "Observație" on any selected text, a
     general comment per page. Each comment is POSTed at once to /api/feedback.php (header X-Review-Key),
     the page's saved comments are loaded from there, and "Șterge" sends a DELETE. Without ?review or with
     an empty ?review no request is ever made; drafts stay in memory only (no cookies, no browser storage). */
(function () {
  'use strict';

  /* ---- Header menu, for every visitor: the "Servicii" dropdown of the desktop menu (details.nav-sub) closes
     on a click or tap outside it, on Esc (focus goes back to "Servicii"), when focus moves out of it and when
     a link in it is chosen. Without JS it is a plain details element that opens and closes on its summary;
     the "Servicii" group of the mobile menu only toggles. ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.nav-desktop details.nav-sub'), function (sub) {
    var summary = sub.querySelector('summary');
    var close = function () { sub.open = false; };
    document.addEventListener('pointerdown', function (e) {
      if (sub.open && !sub.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (!sub.open || (e.key !== 'Escape' && e.key !== 'Esc')) return;
      close();
      if (summary) summary.focus();
    });
    // only a move to another element counts (Tab, Shift+Tab); a click on a part of the list that takes no
    // focus (relatedTarget null) must not close it before the click lands
    sub.addEventListener('focusout', function (e) {
      if (sub.open && e.relatedTarget && !sub.contains(e.relatedTarget)) close();
    });
    sub.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) close(); // the link still opens its page
    });
  });

  /* The mobile menu (details.nav-mobile) closes when a link in it is chosen (on /en/ they are in-page links,
     and the open panel would cover the section), on a tap outside it and on Esc (focus goes back to its
     button). The review tools (.rv-ui: bar, dialog, pins) do not count as "outside", so the owner can mark
     an item of the open menu and write the comment. */
  Array.prototype.forEach.call(document.querySelectorAll('details.nav-mobile'), function (menu) {
    var summary = menu.querySelector('summary');
    var inReviewUI = function (el) { return !!(el && el.closest && el.closest('.rv-ui')); };
    document.addEventListener('pointerdown', function (e) {
      if (menu.open && !menu.contains(e.target) && !inReviewUI(e.target)) menu.open = false;
    });
    document.addEventListener('keydown', function (e) {
      if (!menu.open || (e.key !== 'Escape' && e.key !== 'Esc') || inReviewUI(e.target)) return;
      menu.open = false;
      if (summary) summary.focus();
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) menu.open = false; // the link still opens its page
    });
  });

  var WA = 'https://wa.me/40769146666';
  var lang = (document.documentElement.lang || 'ro').slice(0, 2);
  var SCRIPT = document.currentScript; // this file's URL locates /api/ also when the site sits under a sub-path

  /* ---- Review mode: html.review shows the neutral texts that wait for the owner's answers (class
     "pending"; see style.css). Customers never get the class. The mode lives only in the URL: the
     ?review token is copied onto same-origin links and GET forms, so it stays on while navigating.
     A non-empty value (?review=<KEY>) also turns on the owner's comments (initComments below). ---- */
  var REVIEW = 'review';
  var reviewUI = null; // owner comments, only with a key: { decorate(root) } for texts drawn later
  var query = new URLSearchParams(window.location.search);
  if (query.has(REVIEW)) {
    document.documentElement.classList.add(REVIEW);
    var reviewKey = query.get(REVIEW) || '';
    // same token the page was opened with ("review" or "review="), so a link to this same page
    // plus a #hash differs only in the hash and scrolls instead of reloading
    var token = window.location.search.slice(1).split('&').filter(function (p) {
      return p.split('=')[0] === REVIEW;
    })[0] || REVIEW + '=';
    var sameOrigin = function (raw) {
      try {
        var u = new URL(raw, window.location.href);
        return u.origin === window.location.origin ? u : null;
      } catch (e) { return null; }
    };
    Array.prototype.forEach.call(document.links, function (a) {
      var raw = a.getAttribute('href') || '';
      if (raw.charAt(0) === '#') return; // in-page anchors already keep the current query
      var u = sameOrigin(raw);
      if (!u || u.searchParams.has(REVIEW)) return;
      u.search = (u.search ? u.search + '&' : '?') + token;
      a.setAttribute('href', u.pathname + u.search + u.hash);
    });
    Array.prototype.forEach.call(document.querySelectorAll('form[action]'), function (f) {
      if ((f.getAttribute('method') || 'get').toLowerCase() !== 'get' || f.elements[REVIEW]) return;
      if (!sameOrigin(f.getAttribute('action'))) return;
      var h = document.createElement('input');
      h.type = 'hidden'; h.name = REVIEW; h.value = reviewKey; // the form encodes it back to the same value
      f.appendChild(h);
    });
    if (reviewKey.trim()) reviewUI = initComments(reviewKey);
  }

  /* ---- Owner comments (review mode with a key). The key arrives only in the owner's link; the server
     keeps only its sha256 (api/feedback.php). Page text and server data are always inserted with
     textContent. Elements built here carry class "rv-ui" (styles: style.css, "Owner comments").
     "Marchează" turns on marking mode: a tap on any block of the page (text, heading, photo, price row,
     card, button, footer column) opens the comment dialog for it. Every saved comment found on the page
     gets a numbered pin; the numbers are the page's comments in time order, as in the list and in the
     output of the fetch-feedback workflow. ---- */
  function initComments(key) {
    var MAX_TARGET = 500, MAX_COMMENT = 2000, MAX_ANCHOR = 300, MAX_EXCERPT = 200, TIMEOUT = 15000;
    var root = document.documentElement;
    root.classList.add('review-key');
    // The owner is addressed formally ("dumneavoastră"), as in the team's letter (research/owner-questions.md).
    var MSG = {
      banner: 'Mod verificare: atingeți „Marchează” și apoi orice parte a paginii, sau „Răspunde” la textele galbene.',
      // "s-\u2060o": a word joiner keeps "s-o" on one line
      bannerPlain: 'Mod verificare: atingeți „Marchează” și apoi orice parte a paginii pe care vreți s-\u2060o comentați.',
      marking: 'Mod marcare: atingeți orice parte a paginii pe care vreți s-\u2060o comentați. Apăsați din nou „Marchează” ca să ieșiți.',
      personal: 'Linkul cu care ați intrat (și orice pagină deschisă din el) este doar pentru dumneavoastră: nu îl trimiteți clienților.',
      forbidden: 'Linkul de verificare nu e valid. Cereți-ne pe WhatsApp un link nou.',
      off: 'Observațiile nu sunt încă pornite pe site. Anunțați-ne pe WhatsApp.',
      failed: 'Nu s-a putut salva. Încercați din nou.',
      loadFailed: 'Nu s-au putut încărca observațiile salvate. Puteți lăsa totuși observații noi.',
      empty: 'Scrieți observația înainte să salvați.',
      saved: '✓ Salvat (nr. {n}). Observația a ajuns pe server.',
      gone: 'Locul nu mai există pe această pagină.',
      hidden: 'Locul nu se vede acum pe pagină (poate e într-un meniu închis).',
      placeGone: '(locul nu mai există pe pagină)',
      deleted: 'Observația a fost ștearsă. Numerele celorlalte s-au actualizat.',
      alreadyDeleted: 'Observația fusese deja ștearsă.',
      deleteFailed: 'Nu s-a putut șterge. Încercați din nou.'
    };
    var KIND = {
      pending: { label: 'Răspuns la textul galben', title: 'Răspuns la textul galben', quote: 'Textul galben:',
        field: 'Răspunsul dumneavoastră (de exemplu prețul corect sau ce ar trebui să scrie aici)' },
      selection: { label: 'Observație pe text', title: 'Observație pe textul selectat', quote: 'Textul selectat:',
        field: 'Observația dumneavoastră' },
      marker: { label: 'Marcaj pe pagină', title: 'Observație pe locul marcat', quote: 'Locul marcat:',
        field: 'Ce nu este în regulă aici sau ce trebuie schimbat?' },
      general: { label: 'Observație generală', title: 'Observație generală despre pagină', quote: 'Pagina:',
        field: 'Observația dumneavoastră despre toată pagina' }
    };
    var BLOCK_TAGS = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|CAPTION|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LABEL|LEGEND|LI|MAIN|NAV|OL|P|PRE|SECTION|SUMMARY|TABLE|TBODY|TD|TFOOT|TH|THEAD|TR|UL)$/;
    var BLOCKS = 'p, li, td, th, dt, dd, h1, h2, h3, h4, h5, h6, blockquote, figcaption, caption, summary, label, legend, pre';
    // where text can be selected: the page content and the footer (address, hours), never the header or this UI
    var scopes = [document.querySelector('main'), document.querySelector('.site-footer')].filter(Boolean);
    if (!scopes.length) scopes = [document.body];
    var header = document.querySelector('.site-header');
    // what "Marchează" can mark: the header too (call button, menu), first match wins
    var markScopes = [header].concat(scopes).filter(Boolean);
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var endpoint = '/api/feedback.php';
    try { if (SCRIPT && SCRIPT.src) endpoint = new URL('../../api/feedback.php', SCRIPT.src).pathname; } catch (e) { /* keep the default */ }
    var page = (window.location.pathname || '/').replace(/\/index\.html$/, '/').slice(0, 200);
    var entries = [];   // saved comments of this page in time order (server entries; rv* fields are local only)
    var numBase = 0;    // comments older than the server's list (it sends the newest 200): numbers go on from there
    var drafts = {};    // unsaved text per target, in memory only: survives Esc / the back gesture, not a reload
    var saveSeq = 0;    // counts comments saved in this tab (rvSeq), so a reload knows which ones its answer could not hold yet
    var cur = null, busy = false, statusTimer = 0, marking = false;
    var blocked = ''; // set when the server refused the key (403) or has none (503): nothing can be saved
    var pageLang = root.lang || 'ro';

    function make(tag, cls, text) {
      var el = document.createElement(tag);
      if (cls) el.className = cls;
      if (cls && /(^| )rv-ui( |$)/.test(cls)) el.lang = 'ro'; // the comment UI is Romanian, also on /en/
      if (text !== undefined) el.textContent = text;
      return el;
    }
    function button(cls, text) { var b = make('button', 'rv-btn ' + (cls || ''), text); b.type = 'button'; return b; }
    function clip(s, max) { // by characters, never splitting an emoji; "…" marks a cut
      var chars = Array.from(String(s || ''));
      return chars.length > max ? chars.slice(0, max - 1).join('').replace(/\s+$/, '') + '…' : chars.join('');
    }
    function each(list, fn) { Array.prototype.forEach.call(list, fn); }
    function focusQuiet(el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    function isSkipped(n) { return n.nodeType === 1 && (n.classList.contains('rv-ui') || /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|SELECT|DATALIST)$/.test(n.tagName)); }

    // Text of a node on one line: whitespace runs become one space, blocks are separated by a space, this UI
    // is skipped. map[i] is the text node holding character i, so a saved text can be found on the page again.
    function textIndex(node) {
      var text = '', map = [], space = true, n;
      var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: function (x) { return isSkipped(x) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
      });
      while ((n = walker.nextNode())) {
        if (n.nodeType === 1) {
          if (!space && BLOCK_TAGS.test(n.tagName)) { text += ' '; map.push(n); space = true; }
          continue;
        }
        for (var i = 0, s = n.data; i < s.length; i++) {
          var c = s.charAt(i);
          if (/\s/.test(c)) { if (!space) { text += ' '; map.push(n); space = true; } } else { text += c; map.push(n); space = false; }
        }
      }
      if (space && text) { text = text.slice(0, -1); map.pop(); }
      return { text: text, map: map };
    }
    function textOf(node) { return node ? textIndex(node).text : ''; }
    function blockOf(node) {
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      return el ? (el.closest(BLOCKS) || el) : null;
    }

    /* Target of a yellow text: its section heading, the nearest heading above it inside the section (when
       different), row and column (for a price cell) and the text itself,
       e.g. "Schimbare baterie iPhone › iPhone 13 mini › Originală › Preț la telefon". Saved comments are
       matched to the yellow texts by this exact string, so two yellow texts must never share one. */
    function pendingTarget(el) {
      var parts = [], box = el.closest('section, article'), h = box && box.querySelector('h1, h2, h3');
      if (h) parts.push(textOf(h));
      var near = null, stop = box || el.closest('main, footer') || document.body;
      for (var n = el; n && n !== stop && !near; n = n.parentElement) {
        for (var sib = n.previousElementSibling; sib && !near; sib = sib.previousElementSibling) {
          if (/^H[1-3]$/.test(sib.tagName)) near = sib;
          else { var hs = sib.querySelectorAll('h1, h2, h3'); if (hs.length) near = hs[hs.length - 1]; }
        }
      }
      if (near && near !== h) parts.push(textOf(near));
      var cell = el.closest('td, th'), dd = el.closest('dd');
      if (cell) {
        var rowHead = cell.parentNode.querySelector('th');
        if (rowHead && rowHead !== cell) {
          var copy = rowHead.cloneNode(true);
          each(copy.querySelectorAll('.row-note'), function (x) { x.parentNode.removeChild(x); });
          parts.push(textOf(copy));
        }
        var table = cell.closest('table'), headRow = table && table.tHead && table.tHead.rows[0];
        var col = headRow && headRow.cells[cell.cellIndex];
        if (col && col !== cell) parts.push(textOf(col));
      } else if (dd && dd.previousElementSibling && dd.previousElementSibling.tagName === 'DT') {
        parts.push(textOf(dd.previousElementSibling));
      }
      parts.push(textOf(el));
      return clip(parts.filter(Boolean).join(' › '), MAX_TARGET);
    }

    /* ---- Where a marked element is: "anchor" = a CSS path from the nearest ancestor with an id (or from
       main / the header / the footer), with tag, up to two stable class names and :nth-of-type, e.g.
       "#baterie > div.wrap.stack:nth-of-type(1) > div.table-wrap:nth-of-type(1) > table.prices:nth-of-type(1)
       > tbody:nth-of-type(1) > tr:nth-of-type(17)". Elements of this UI never count, so the path matches the
       page as visitors get it. Only the characters api/feedback.php accepts are ever used. ---- */
    var SAFE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
    var ANCHOR_OK = /^[A-Za-z0-9 >:.#_()\[\]="'-]+$/;
    var SEGMENT = /^([a-z][a-z0-9]*)((?:\.[A-Za-z][A-Za-z0-9_-]*)*):nth-of-type\((\d{1,4})\)$/;
    function nthOfType(el) {
      var k = 1;
      for (var s = el.previousElementSibling; s; s = s.previousElementSibling) {
        if (s.tagName === el.tagName && !s.classList.contains('rv-ui')) k++;
      }
      return k;
    }
    function stableClasses(el) { // "pending" goes away once the owner has answered; rv-* are this UI's own
      return Array.prototype.filter.call(el.classList, function (c) {
        return SAFE_NAME.test(c) && !/^(rv-|review)/.test(c) && c !== 'pending';
      }).slice(0, 2);
    }
    function segment(el, withClasses) {
      var cls = withClasses ? stableClasses(el).map(function (c) { return '.' + c; }).join('') : '';
      return el.tagName.toLowerCase() + cls + ':nth-of-type(' + nthOfType(el) + ')';
    }
    function uniqueId(el) {
      var id = el.id;
      return id && SAFE_NAME.test(id) && !/^rv-/.test(id) && document.querySelectorAll('#' + id).length === 1 ? id : '';
    }
    function buildAnchor(el) {
      if (!el || el.nodeType !== 1) return '';
      // shorter variants when the path is too long: classes only on the element, then none at all
      for (var level = 2; level >= 0; level--) {
        var parts = [], start = '';
        for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
          var id = uniqueId(n);
          if (id) { start = '#' + id; break; }
          if (n.tagName === 'MAIN' && document.querySelectorAll('main').length === 1) { start = 'main'; break; }
          if (n === document.body) { start = 'body'; break; }
          parts.unshift(segment(n, level === 2 || (level === 1 && n === el)));
        }
        var a = [start].concat(parts).join(' > ');
        if (start && a.length <= MAX_ANCHOR && ANCHOR_OK.test(a) && resolveAnchor(a) === el) return a;
      }
      return '';
    }
    function resolveAnchor(a) {
      if (!a || a.length > MAX_ANCHOR || !ANCHOR_OK.test(a)) return null;
      var parts = a.split(' > '), first = parts.shift(), node = null;
      if (first === 'body') node = document.body;
      else if (first === 'main') node = document.querySelector('main');
      else if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(first)) node = document.getElementById(first.slice(1));
      else {
        try { node = document.querySelector(a); } catch (e) { node = null; } // a path in another format
        return node && !node.closest('.rv-ui') ? node : null;
      }
      for (var i = 0; node && i < parts.length; i++) {
        var m = SEGMENT.exec(parts[i]), found = null;
        if (!m) return null;
        for (var c = node.firstElementChild, k = +m[3]; c && !found; c = c.nextElementSibling) {
          if (c.tagName.toLowerCase() === m[1] && !c.classList.contains('rv-ui') && --k === 0) found = c;
        }
        var classes = m[2] ? m[2].slice(1).split('.') : [];
        if (found && classes.some(function (x) { return !found.classList.contains(x); })) found = null;
        node = found;
      }
      return node && !node.closest('.rv-ui') ? node : null;
    }

    /* ---- Server ---- */
    function request(method, body, query) {
      // the key goes in a header: only printable ASCII can match the sha256 made at deploy time
      if (!/^[\x20-\x7e]+$/.test(key)) return Promise.resolve({ status: 403, data: null });
      if (!window.fetch) return Promise.resolve({ status: 0, data: null });
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : 0;
      var opts = { method: method, headers: { 'X-Review-Key': key }, cache: 'no-store', credentials: 'same-origin' };
      if (ctrl) opts.signal = ctrl.signal;
      if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      return fetch(endpoint + (query ? '?' + query : ''), opts).then(function (r) {
        return r.text().then(function (t) {
          var data = null;
          try { data = JSON.parse(t); } catch (e) { /* not JSON, e.g. an HTML error page */ }
          return { status: r.status, data: data };
        });
      }).catch(function () { return { status: 0, data: null }; }).then(function (res) {
        clearTimeout(timer);
        return res;
      });
    }
    function errorFor(status) { return status === 403 ? MSG.forbidden : status === 503 ? MSG.off : MSG.failed; }
    function clean(e) {
      if (!e || typeof e !== 'object' || !Object.prototype.hasOwnProperty.call(KIND, e.kind)) return null;
      return { id: String(e.id || ''), time: String(e.time || ''), page: String(e.page || ''), kind: e.kind,
        target: String(e.target || ''), comment: String(e.comment || ''),
        anchor: typeof e.anchor === 'string' ? e.anchor : '' };
    }

    /* ---- Bottom bar: help text, status, "Marchează", "Adaugă observație", the list panel ---- */
    var bar = make('div', 'rv-ui rv-bar');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Verificare site');
    var inner = make('div', 'rv-bar__inner');
    var panel = make('section', 'rv-panel');
    panel.id = 'rv-panel';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'rv-panel-title');
    var panelHead = make('div', 'rv-panel__head');
    var panelTitle = make('h2', 'rv-panel__title');
    panelTitle.id = 'rv-panel-title';
    panelTitle.tabIndex = -1;
    var panelClose = button('', 'Închide');
    var emptyNote = make('p', 'rv-panel__empty', 'Încă nu ați lăsat observații pe această pagină.');
    var list = make('ol', 'rv-list');
    panelHead.appendChild(panelTitle);
    panelHead.appendChild(panelClose);
    panel.appendChild(panelHead);
    panel.appendChild(make('p', 'rv-panel__note', MSG.personal));
    panel.appendChild(emptyNote);
    panel.appendChild(list);
    var status = make('p', 'rv-bar__status');
    status.setAttribute('role', 'status');
    var actions = make('div', 'rv-bar__actions');
    var markBtn = button('rv-btn--mark', 'Marchează');
    markBtn.setAttribute('aria-pressed', 'false');
    var addBtn = button('rv-btn--primary', 'Adaugă observație');
    var listBtn = button('', '');
    listBtn.setAttribute('aria-controls', 'rv-panel');
    listBtn.setAttribute('aria-expanded', 'false');
    actions.appendChild(markBtn);
    actions.appendChild(addBtn);
    actions.appendChild(listBtn);
    var help = make('p', 'rv-bar__text');
    help.setAttribute('aria-live', 'polite');
    function syncHelp() {
      help.textContent = marking ? MSG.marking : document.querySelector('.pending') ? MSG.banner : MSG.bannerPlain;
    }
    syncHelp();
    inner.appendChild(panel);
    inner.appendChild(help);
    inner.appendChild(status);
    inner.appendChild(actions);
    bar.appendChild(inner);
    document.body.appendChild(bar);

    function syncBar() { root.style.setProperty('--rv-bar-h', Math.ceil(bar.getBoundingClientRect().height) + 'px'); }
    if (window.ResizeObserver) new ResizeObserver(syncBar).observe(bar);
    else window.addEventListener('resize', syncBar);
    syncBar();

    function setStatus(msg, isError) {
      clearTimeout(statusTimer);
      status.textContent = msg || '';
      status.classList.toggle('rv-bar__status--error', !!isError);
      if (msg && !isError) statusTimer = setTimeout(function () { status.textContent = ''; syncBar(); }, 8000);
      syncBar();
    }
    function togglePanel(open) {
      panel.hidden = !open;
      listBtn.setAttribute('aria-expanded', String(open));
      syncBar();
    }
    listBtn.addEventListener('click', function () { togglePanel(panel.hidden); });
    panelClose.addEventListener('click', function () { togglePanel(false); listBtn.focus(); });
    bar.addEventListener('keydown', function (e) { // focus is on the toggle or inside the panel
      if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); togglePanel(false); listBtn.focus(); }
    });

    function fmtTime(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      var p = function (x) { return ('0' + x).slice(-2); };
      return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function metaOf(e) { return KIND[e.kind].label + (e.time ? ' · ' + fmtTime(e.time) : ''); }
    function isShown(el) { // a closed <details> keeps boxes for its content (content-visibility): checkVisibility sees it
      return !!el && el.getClientRects().length > 0 &&
        (typeof el.checkVisibility !== 'function' || el.checkVisibility({ visibilityProperty: true }));
    }
    function flash(el, cls) {
      el.classList.add(cls);
      setTimeout(function () { el.classList.remove(cls); }, 2400);
    }
    function showOnPage(e) {
      var el = locate(e, {});
      if (!el) { setStatus(MSG.gone, true); return; }
      if (!isShown(el)) { setStatus(MSG.hidden, true); return; }
      togglePanel(false);
      el.scrollIntoView({ block: 'center' });
      // the button that was focused is now hidden: move focus to the text's "Răspunde", or to the place itself
      var f = el.rvTools ? el.rvTools.querySelector('.rv-btn--reply') : el;
      if (f === el && !el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '-1'); el.rvTmpTab = true; } // "Marchează" may replace it
      focusQuiet(f);
      flash(el, 'rv-flash');
      if (e.rvPin) flash(e.rvPin, 'rv-pin--flash');
      schedulePlace();
    }

    /* ---- Deleting: "Șterge", then "Ștergeți observația nr. n?" (the server only appends a deletion line;
       the team can still see what was deleted) ---- */
    function canDelete(e) { return /^[0-9a-f]{12}$/.test(e.id); }
    function deleteUI(e, inPanel) {
      var box = make('div', 'rv-del');
      var del = button('rv-btn--small rv-btn--danger', 'Șterge');
      del.setAttribute('aria-label', 'Șterge observația nr. ' + e.rvNum);
      var ask = make('p', 'rv-del__ask', 'Ștergeți observația nr. ' + e.rvNum + '?');
      var yes = button('rv-btn--small rv-btn--danger-solid', 'Da, ștergeți');
      var no = button('rv-btn--small', 'Nu');
      function setAsk(on) {
        del.hidden = on;
        ask.hidden = yes.hidden = no.hidden = !on;
        focusQuiet(on ? no : del);
      }
      ask.hidden = yes.hidden = no.hidden = true;
      del.addEventListener('click', function () { setAsk(true); });
      no.addEventListener('click', function () { setAsk(false); });
      yes.addEventListener('click', function () {
        yes.disabled = no.disabled = true;
        yes.textContent = 'Se șterge…';
        removeEntry(e, inPanel).then(function (done) {
          if (done) return;
          yes.disabled = no.disabled = false;
          yes.textContent = 'Da, ștergeți';
        });
      });
      [del, ask, yes, no].forEach(function (x) { box.appendChild(x); });
      return box;
    }
    // A host firewall may refuse DELETE with its own error page: then the same deletion goes as a POST.
    function sendDelete(id) {
      return request('DELETE', null, 'id=' + id).then(function (res) {
        var ours = res.data && typeof res.data === 'object' && (res.data.ok || res.data.error);
        return ours || res.status === 0 ? res : request('POST', { action: 'delete', id: id });
      });
    }
    function removeEntry(e, inPanel) {
      if (blocked) { setStatus(blocked, true); return Promise.resolve(false); }
      return sendDelete(e.id).then(function (res) {
        var d = res.data || {};
        if ((res.status === 200 && d.ok) || (res.status === 404 && d.error === 'not_found')) { // 404: already deleted (another tab, or a retry)
          var i = entries.indexOf(e);
          if (i !== -1) entries.splice(i, 1);
          hidePop(false);
          refresh();
          if (res.status === 404) load(false); // this list was out of date
          setStatus(res.status === 200 ? MSG.deleted : MSG.alreadyDeleted);
          focusQuiet(inPanel && !panel.hidden ? panelTitle : listBtn);
          return true;
        }
        // only our own JSON answer blocks saving; a 403 page from the hosting's firewall must not
        var err = res.data && res.data.error;
        if (err === 'forbidden' || err === 'not_configured') blocked = errorFor(res.status);
        setStatus(blocked || MSG.deleteFailed, true);
        return false;
      });
    }

    function renderPanel() {
      var n = entries.length;
      listBtn.textContent = 'Observații salvate (' + n + ')';
      panelTitle.textContent = 'Observații salvate pe această pagină (' + n + ')';
      emptyNote.hidden = n > 0;
      while (list.firstChild) list.removeChild(list.firstChild);
      entries.forEach(function (e) { // nr. 1 first: the numbers the pins and the team's list use
        var li = make('li', 'rv-item');
        var meta = make('p', 'rv-item__meta');
        meta.appendChild(make('span', 'rv-num', String(e.rvNum)));
        meta.appendChild(make('span', '', metaOf(e)));
        li.appendChild(meta);
        if (e.target) { var q = make('blockquote', 'rv-quote rv-quote--small', clip(e.target, 240)); q.lang = pageLang; li.appendChild(q); }
        li.appendChild(make('p', 'rv-item__comment', e.comment));
        if (!e.rvAt && e.kind !== 'general') li.appendChild(make('p', 'rv-item__gone', MSG.placeGone));
        var row = make('div', 'rv-item__actions');
        if (e.rvAt) {
          var go = button('rv-btn--small', 'Arată pe pagină');
          go.addEventListener('click', function () { showOnPage(e); });
          row.appendChild(go);
        }
        if (canDelete(e)) row.appendChild(deleteUI(e, true));
        if (row.firstChild) li.appendChild(row);
        list.appendChild(li);
      });
      syncBar();
    }

    /* ---- "✓ Salvat" next to the yellow texts; finding saved comments on the page ---- */
    function setBadge(host, n) {
      var b = host.rvBadge;
      if (!n) { if (b && b.parentNode) b.parentNode.removeChild(b); host.rvBadge = null; return; }
      if (!b) { b = host.rvBadge = make('span', 'rv-ui rv-saved'); host.appendChild(b); }
      b.textContent = '✓ Salvat' + (n > 1 ? ' (' + n + ')' : '');
    }
    function findText(target, cache) { // the block where the text starts
      var needle = target.replace(/…$/, '').trim();
      if (!needle) return null;
      for (var i = 0; i < scopes.length; i++) {
        var ix = cache[i] || (cache[i] = textIndex(scopes[i]));
        var at = ix.text.indexOf(needle);
        if (at !== -1) return blockOf(ix.map[at]);
      }
      return null;
    }
    // The smallest element holding the whole excerpt of a marked place. Spaces are ignored: the excerpt
    // follows the rendering (excerptOf), the page index follows the tags (textIndex).
    function squash(s) { return String(s).replace(/\s+/g, ''); }
    function findPlace(target, cache) {
      var needle = squash(target.replace(/…$/, ''));
      if (Array.from(needle).length < 16) return null; // short texts ("Preț la telefon") repeat on the page
      for (var i = 0; i < markScopes.length; i++) {
        var sq = cache['p' + i];
        if (!sq) {
          var ix = textIndex(markScopes[i]);
          sq = cache['p' + i] = { text: '', map: [] };
          for (var k = 0; k < ix.text.length; k++) {
            if (ix.text.charAt(k) !== ' ') { sq.text += ix.text.charAt(k); sq.map.push(ix.map[k]); }
          }
        }
        var at = sq.text.indexOf(needle);
        if (at === -1) continue;
        for (var el = sq.map[at].parentElement; el && el !== document.body; el = el.parentElement) {
          if (el.closest('.rv-ui')) break;
          if (squash(textOf(el)).indexOf(needle) !== -1) return el;
        }
      }
      return null;
    }
    function locate(e, cache) {
      if (e.kind === 'pending') {
        var found = null;
        each(document.querySelectorAll('.pending'), function (el) { if (!found && el.rvTarget === e.target) found = el; });
        return found;
      }
      if (e.kind === 'selection') {
        // the block the owner selected in, while this page is open; after a reload, where the text is found
        if (e.rvBlock && document.contains(e.rvBlock)) return e.rvBlock;
        return findText(e.target, cache) || resolveAnchor(e.anchor);
      }
      if (e.kind === 'marker') {
        if (e.rvEl && document.contains(e.rvEl)) return e.rvEl;
        // the path first; if the element there now shows another text, where that text moved (if anywhere)
        var el = resolveAnchor(e.anchor);
        if (el && excerptOf(el) === e.target) return el;
        return findPlace(e.target, cache) || el;
      }
      return null;
    }
    function applyMarks() {
      var cache = {};
      each(document.querySelectorAll('.pending'), function (el) {
        if (!el.rvTools) return;
        setBadge(el.rvTools, entries.filter(function (e) { return e.kind === 'pending' && e.target === el.rvTarget; }).length);
      });
      entries.forEach(function (e, i) {
        e.rvNum = numBase + i + 1;
        e.rvAt = locate(e, cache);
        if (e.kind === 'selection' && e.rvAt) e.rvBlock = e.rvAt;
        if (e.kind === 'marker' && e.rvAt) e.rvEl = e.rvAt;
      });
      drawPins();
    }
    function refresh() { applyMarks(); renderPanel(); }
    function addEntries(items) {
      items.forEach(function (e) {
        var dup = e.id && entries.some(function (x) { return x.id === e.id; });
        if (!dup) entries.push(e);
      });
      refresh();
    }

    /* ---- Numbered pins: a layer over the page (and one inside the sticky header, so its pins move with it).
       Placed from getBoundingClientRect + scroll with CSSOM only; they never change the page's layout. ---- */
    var pinLayer = make('div', 'rv-ui rv-pins');
    document.body.appendChild(pinLayer);
    var headLayer = null;
    if (header) { headLayer = make('div', 'rv-ui rv-pins rv-pins--head'); header.appendChild(headLayer); }
    var pinned = []; // entries that have a pin
    function drawPins() {
      pinned.forEach(function (e) {
        if (entries.indexOf(e) === -1 || !e.rvAt) {
          if (e.rvPin && e.rvPin.parentNode) e.rvPin.parentNode.removeChild(e.rvPin);
          e.rvPin = null;
        }
      });
      pinned = entries.filter(function (e) { return e.rvAt; });
      pinned.forEach(function (e) {
        var b = e.rvPin;
        if (!b) {
          b = e.rvPin = make('button', 'rv-ui rv-pin');
          b.type = 'button';
          b.setAttribute('aria-expanded', 'false');
          b.setAttribute('aria-controls', 'rv-pop');
          b.addEventListener('click', function () { openPop(e); });
        }
        b.textContent = String(e.rvNum);
        b.setAttribute('aria-label', 'Observația nr. ' + e.rvNum + ': ' + clip(e.comment, 80));
        var layer = headLayer && header.contains(e.rvAt) ? headLayer : pinLayer;
        if (b.parentNode !== layer) layer.appendChild(b);
      });
      if (popEntry && pinned.indexOf(popEntry) === -1) hidePop(false);
      if (popEntry) popTitle.textContent = 'Observația nr. ' + popEntry.rvNum;
      placePins();
    }
    function clipBox(el) { // the visible part of the scrolling boxes around el (a table, the TikTok row)
      var box = null;
      for (var a = el.parentElement; a && a !== document.body && a !== root; a = a.parentElement) {
        var cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        var r = a.getBoundingClientRect();
        box = box ? { l: Math.max(box.l, r.left), r: Math.min(box.r, r.right), t: Math.max(box.t, r.top), b: Math.min(box.b, r.bottom) }
          : { l: r.left, r: r.right, t: r.top, b: r.bottom };
      }
      return box;
    }
    var PIN_GAP = 4; // px between two pins
    function clashes(placed, layer, x, y, w, h) {
      return placed.some(function (p) {
        return p.l === layer && x < p.x + p.w + PIN_GAP && p.x < x + w + PIN_GAP && y < p.y + p.h + PIN_GAP && p.y < y + h + PIN_GAP;
      });
    }
    function placePins() {
      var vw = root.clientWidth, todo = [], seen = [], placed = [];
      var hr = headLayer ? header.getBoundingClientRect() : null;
      pinned.forEach(function (e) { // read everything first, then write: no layout thrashing
        var b = e.rvPin, el = e.rvAt;
        var size = b.offsetWidth || 30, high = b.offsetHeight || 30;
        var r = el.getBoundingClientRect();
        var show = isShown(el) && (r.width > 0 || r.height > 0);
        var slot = 0, k;
        for (k = 0; k < seen.length; k++) if (seen[k].el === el) { slot = ++seen[k].n; break; }
        if (k === seen.length) seen.push({ el: el, n: 0 });
        // centred on the element's top-right corner; more comments on one element line up to the left
        var x = r.right - size / 2 - slot * (size + PIN_GAP), y = r.top - high / 2;
        var box = show ? clipBox(el) : null, minX = 2;
        if (box) {
          if (r.right < box.l + 4 || r.left > box.r - 4 || r.bottom < box.t || r.top > box.b) show = false;
          x = Math.min(Math.max(x, box.l + 2), box.r - size - 2);
          minX = Math.max(minX, box.l + 2);
        }
        x = Math.min(Math.max(x, 2), vw - size - 2);
        var dx = b.parentNode === headLayer ? -hr.left : window.pageXOffset;
        var dy = b.parentNode === headLayer ? -hr.top : window.pageYOffset;
        x += dx; y = Math.max(2, y + dy); minX += dx;
        if (show) {
          // elements that share a corner (a row and its cell, a card and its title): a pin never covers another
          // one or its tap area; it moves to the left of the pins already there, or below them at the edge
          for (var n = 0; n < 20 && clashes(placed, b.parentNode, x, y, size, high); n++) {
            if (x - size - PIN_GAP >= minX) x -= size + PIN_GAP; else y += high + PIN_GAP;
          }
          placed.push({ l: b.parentNode, x: x, y: y, w: size, h: high });
        }
        todo.push({ b: b, show: show, x: x, y: y });
      });
      todo.forEach(function (t) {
        t.b.hidden = !t.show;
        if (!t.show) return;
        t.b.style.left = Math.round(t.x) + 'px';
        t.b.style.top = Math.round(t.y) + 'px';
      });
      if (popEntry) placePop();
    }
    var placeQueued = false;
    function schedulePlace() {
      if (placeQueued) return;
      placeQueued = true;
      var run = function () { placeQueued = false; if (pinned.length) placePins(); };
      if (window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run, 16);
    }
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('load', schedulePlace);
    // the page itself scrolls the pins along; boxes that scroll sideways (tables, the TikTok row) need a redo
    document.addEventListener('scroll', function (ev) { if (ev.target !== document) schedulePlace(); }, { capture: true, passive: true });
    document.addEventListener('toggle', schedulePlace, true); // <details>, e.g. the menu
    document.addEventListener('load', schedulePlace, true);   // images
    if (document.fonts) {
      if (document.fonts.ready) document.fonts.ready.then(schedulePlace);
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', schedulePlace);
    }
    if (window.ResizeObserver) new ResizeObserver(schedulePlace).observe(document.body);

    /* ---- Popover of a pin: the comment, "Șterge", "Închide" ---- */
    var pop = make('div', 'rv-ui rv-pop');
    pop.id = 'rv-pop';
    pop.hidden = true;
    pop.tabIndex = -1;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-labelledby', 'rv-pop-title');
    var popTitle = make('p', 'rv-pop__title');
    popTitle.id = 'rv-pop-title';
    var popMeta = make('p', 'rv-pop__meta');
    var popQuote = make('blockquote', 'rv-quote rv-quote--small');
    popQuote.lang = pageLang;
    var popText = make('p', 'rv-item__comment');
    var popActions = make('div', 'rv-pop__actions');
    var popClose = button('rv-btn--small', 'Închide');
    [popTitle, popMeta, popQuote, popText, popActions].forEach(function (x) { pop.appendChild(x); });
    pinLayer.appendChild(pop);
    var popEntry = null;
    function openPop(e) {
      if (popEntry === e) { hidePop(true); return; }
      hidePop(false);
      popEntry = e;
      popTitle.textContent = 'Observația nr. ' + e.rvNum;
      popMeta.textContent = metaOf(e);
      popQuote.textContent = clip(e.target, 240);
      popQuote.hidden = !e.target;
      popText.textContent = e.comment;
      while (popActions.firstChild) popActions.removeChild(popActions.firstChild);
      if (canDelete(e)) popActions.appendChild(deleteUI(e, false));
      popActions.appendChild(popClose);
      if (pop.parentNode !== e.rvPin.parentNode) e.rvPin.parentNode.appendChild(pop);
      pop.hidden = false;
      e.rvPin.setAttribute('aria-expanded', 'true');
      placePop();
      pop.scrollTop = 0;
      focusQuiet(pop);
    }
    function hidePop(back) {
      if (!popEntry) return;
      var e = popEntry;
      popEntry = null;
      pop.hidden = true;
      if (!e.rvPin) return;
      e.rvPin.setAttribute('aria-expanded', 'false');
      if (back && document.contains(e.rvPin)) focusQuiet(e.rvPin);
    }
    function placePop() { // under the pin (over it if there is no room), between the call header and the bar
      var b = popEntry.rvPin;
      if (!b || b.hidden || !document.contains(b)) { hidePop(false); return; }
      var pr = b.getBoundingClientRect(), vw = root.clientWidth, w = Math.min(320, vw - 16);
      pop.style.width = w + 'px';
      pop.style.maxHeight = ''; // measured at its full height, limited again below if it fits nowhere
      pop.classList.remove('rv-pop--fit');
      var h = pop.offsetHeight, inHead = pop.parentNode === headLayer;
      var minTop = inHead ? 8 : (header ? Math.max(0, header.getBoundingClientRect().bottom) : 0) + 8;
      var maxBottom = bar.getBoundingClientRect().top - 8;
      var left = Math.min(Math.max(8, pr.left + pr.width / 2 - w / 2), vw - w - 8);
      var top = pr.bottom + 6;
      // no room under the pin: over it; no room there either: as low as the bar allows, so "Șterge" and
      // "Închide" stay above the bar
      if (top + h > maxBottom) top = pr.top - 6 - h >= minTop ? pr.top - 6 - h : Math.max(minTop, maxBottom - h);
      if (top < minTop) top = minTop;
      if (h > maxBottom - minTop) { // taller than the room (a phone in landscape): it scrolls, the buttons stay at its bottom
        pop.style.maxHeight = Math.max(120, maxBottom - minTop) + 'px';
        pop.classList.add('rv-pop--fit');
      }
      if (inHead) { var hr = header.getBoundingClientRect(); left -= hr.left; top -= hr.top; }
      else { left += window.pageXOffset; top += window.pageYOffset; }
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
    }
    popClose.addEventListener('click', function () { hidePop(true); });

    /* ---- "Răspunde" next to each yellow text ---- */
    function decorate(scope) {
      each((scope || document.body).querySelectorAll('.pending'), function (el) {
        if (el.rvTools || el.closest('.rv-ui')) return;
        var target = pendingTarget(el);
        var tools = make('span', 'rv-ui rv-tools');
        var btn = button('rv-btn--reply', 'Răspunde');
        btn.setAttribute('aria-label', 'Răspunde: ' + clip(textOf(el), 80));
        btn.addEventListener('click', function () { openDialog({ kind: 'pending', target: target, el: el, trigger: btn }); });
        tools.appendChild(btn);
        // never a button inside a link or another control; inline texts get it right after, blocks at their end
        var host = el.closest('a, button, summary, label') || el;
        if (host === el && !el.matches('a, button, summary, label') &&
            !/^(SPAN|STRONG|EM|B|I|SMALL|MARK|ABBR|TIME|DATA|CODE|S|U)$/.test(el.tagName)) el.appendChild(tools);
        else host.parentNode.insertBefore(tools, host.nextSibling);
        el.rvTools = tools;
        el.rvTarget = target;
        setBadge(tools, entries.filter(function (e) { return e.kind === 'pending' && e.target === target; }).length);
      });
      syncHelp();
    }

    /* ---- Dialog: <dialog> (Esc and the back gesture close it), or a plain panel with role="dialog" ---- */
    var native = typeof make('dialog').showModal === 'function';
    var dlg = make(native ? 'dialog' : 'div', 'rv-ui rv-dialog' + (native ? '' : ' rv-dialog--fallback'));
    dlg.setAttribute('aria-labelledby', 'rv-title');
    var backdrop = null;
    if (!native) {
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.hidden = true;
      backdrop = make('div', 'rv-ui rv-backdrop');
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }
    var title = make('h2', 'rv-dialog__title');
    title.id = 'rv-title';
    var quoteLabel = make('p', 'rv-dialog__label');
    var quote = make('blockquote', 'rv-quote');
    quote.lang = pageLang; // the quoted page text (English on /en/)
    var fieldLabel = make('label', 'rv-dialog__label');
    fieldLabel.htmlFor = 'rv-text';
    var ta = make('textarea', 'rv-textarea');
    ta.id = 'rv-text';
    ta.rows = 5;
    ta.maxLength = MAX_COMMENT;
    var counter = make('p', 'rv-dialog__count');
    counter.id = 'rv-count';
    var err = make('p', 'rv-dialog__error');
    err.id = 'rv-error';
    err.setAttribute('role', 'alert');
    ta.setAttribute('aria-describedby', 'rv-count rv-error');
    var dlgActions = make('div', 'rv-dialog__actions');
    var cancelBtn = button('', 'Renunță');
    var saveBtn = button('rv-btn--primary', 'Salvează');
    dlgActions.appendChild(cancelBtn);
    dlgActions.appendChild(saveBtn);
    [title, quoteLabel, quote, fieldLabel, ta, counter, err, dlgActions].forEach(function (x) { dlg.appendChild(x); });
    document.body.appendChild(dlg);

    function draftId(c) { return c.kind + '\n' + (c.anchor || '') + '\n' + c.target; }
    function updateCount() { counter.textContent = ta.value.length + ' / ' + MAX_COMMENT; }
    function pageName() {
      var h1 = document.querySelector('main h1');
      return (h1 && textOf(h1)) || document.title;
    }
    function openDialog(c) {
      if (busy) return;
      if (cur) closeDialog(false);
      hideFloat();
      hidePop(false);
      cur = c;
      var k = KIND[c.kind];
      title.textContent = k.title;
      quoteLabel.textContent = k.quote;
      quote.textContent = c.kind === 'general' ? pageName() : c.target;
      fieldLabel.textContent = k.field;
      ta.value = drafts[draftId(c)] || '';
      err.textContent = blocked; // a refused or missing key shows before anything is typed
      updateCount();
      if (native) dlg.showModal(); else { backdrop.hidden = false; dlg.hidden = false; }
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    function closeDialog(discard) {
      if (!cur) return;
      var c = cur;
      cur = null;
      if (c.kind === 'marker' && c.el) c.el.classList.remove('rv-picked');
      if (discard || !ta.value.trim()) delete drafts[draftId(c)]; else drafts[draftId(c)] = ta.value;
      if (native) { if (dlg.open) dlg.close(); } else { dlg.hidden = true; backdrop.hidden = true; }
      var back = c.trigger && document.contains(c.trigger) && c.trigger.getClientRects().length ? c.trigger : addBtn;
      focusQuiet(back);
    }
    function setBusy(on) {
      busy = on;
      saveBtn.disabled = on;
      cancelBtn.disabled = on;
      ta.readOnly = on;
      saveBtn.textContent = on ? 'Se salvează…' : 'Salvează';
      dlg.setAttribute('aria-busy', String(on));
    }
    function save() {
      if (!cur || busy) return;
      if (blocked) { err.textContent = blocked; ta.focus(); return; } // the text stays in the box
      var c = cur, comment = ta.value.replace(/\r\n?/g, '\n').trim();
      if (!comment) { err.textContent = MSG.empty; ta.focus(); return; }
      comment = clip(comment, MAX_COMMENT);
      err.textContent = '';
      setBusy(true);
      var body = { page: page, kind: c.kind, target: c.target, comment: comment };
      if (c.anchor) body.anchor = c.anchor;
      request('POST', body).then(function (res) {
        setBusy(false);
        if (res.status !== 201) { // the text stays in the box (or in the draft) to try again
          if (res.status === 403 || res.status === 503) blocked = errorFor(res.status);
          if (cur === c) { err.textContent = errorFor(res.status); ta.focus(); } else setStatus(errorFor(res.status), true);
          return;
        }
        var entry = clean(res.data && res.data.entry) ||
          { id: '', time: new Date().toISOString(), page: page, kind: c.kind, target: c.target, comment: comment, anchor: c.anchor || '' };
        entry.rvSeq = ++saveSeq;
        entry.rvBlock = c.kind === 'selection' ? c.block || null : null;
        entry.rvEl = c.kind === 'marker' ? c.el || null : null;
        delete drafts[draftId(c)];
        if (cur === c) { ta.value = ''; closeDialog(true); }
        addEntries([entry]);
        // the server's number is the one the team sees; another number here means this list is out of date
        // (it could not be loaded, or another tab changed it): load it again
        var n = res.data && res.data.entry && res.data.entry.n;
        if (typeof n !== 'number' || n < 1 || n !== Math.floor(n)) n = entry.rvNum;
        else if (n !== entry.rvNum) load(false);
        setStatus(n ? MSG.saved.replace('{n}', n) : MSG.saved.replace(' (nr. {n})', ''));
      });
    }
    cancelBtn.addEventListener('click', function () { if (!busy) closeDialog(true); });
    saveBtn.addEventListener('click', save);
    ta.addEventListener('input', function () { updateCount(); if (!busy) err.textContent = blocked; });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    });
    if (native) {
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); if (!busy) closeDialog(false); });
      dlg.addEventListener('close', function () { if (cur) closeDialog(false); }); // closed by the browser itself
    } else {
      dlg.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); if (!busy) closeDialog(false); return; }
        if (e.key !== 'Tab') return;
        var f = [ta, cancelBtn, saveBtn].filter(function (x) { return !x.disabled; });
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      });
    }
    window.addEventListener('beforeunload', function (e) {
      if (!(cur && ta.value.trim()) && !Object.keys(drafts).length) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });

    /* ---- Selected text: a floating "Observație" button under the selection ---- */
    var floatBtn = button('rv-btn--primary rv-ui rv-float', 'Observație');
    floatBtn.hidden = true;
    document.body.appendChild(floatBtn);
    var snap = null, press = null, pressing = false, selTimer = 0;
    function readSelection() {
      var sel = window.getSelection ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      var range = sel.getRangeAt(0), anc = range.commonAncestorContainer;
      var el = anc.nodeType === 1 ? anc : anc.parentElement;
      if (!el || el.closest('.rv-ui, input, textarea, select, button')) return null;
      if (!scopes.some(function (s) { return s.contains(el); })) return null;
      var text = clip(textIndex(range.cloneContents()).text, MAX_TARGET);
      if (!text) return null;
      var start = range.startContainer;
      if (start.nodeType === 1 && start.childNodes[range.startOffset]) start = start.childNodes[range.startOffset];
      return { text: text, block: blockOf(start), range: range };
    }
    function hideFloat() { floatBtn.hidden = true; }
    // Under the selection (above it if there is no room), between the call header and the bar. The button
    // scrolls with the page; while the selection is out of view it hides, and comes back when scrolling stops.
    function showFloat(s) {
      var r = s.range.getBoundingClientRect();
      var minTop = (header ? Math.max(0, header.getBoundingClientRect().bottom) : 0) + 8; // never over the call header
      var barTop = bar.getBoundingClientRect().top;
      if ((!r.width && !r.height) || r.bottom < minTop || r.top > barTop) { hideFloat(); return; }
      floatBtn.hidden = false;
      var vw = root.clientWidth, bw = floatBtn.offsetWidth, bh = floatBtn.offsetHeight;
      var maxTop = barTop - bh - 8;
      var gap = coarse ? 36 : 10; // on phones, clear of the selection handles
      var top = r.bottom + gap;
      if (top > maxTop) top = r.top - gap - bh;
      if (top < minTop) top = Math.max(minTop, maxTop);
      var left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), vw - bw - 8);
      floatBtn.style.top = Math.round(top + window.pageYOffset) + 'px';
      floatBtn.style.left = Math.round(left + window.pageXOffset) + 'px';
    }
    function openSelection(s, trigger) {
      var sel = window.getSelection && window.getSelection();
      if (sel) sel.removeAllRanges();
      snap = null;
      openDialog({ kind: 'selection', target: s.text, block: s.block, anchor: buildAnchor(s.block), trigger: trigger });
    }
    document.addEventListener('selectionchange', function () {
      clearTimeout(selTimer);
      selTimer = setTimeout(function () {
        if (cur || pressing || marking) return;
        snap = readSelection();
        if (snap) showFloat(snap); else hideFloat();
      }, 200);
    });
    var placeTimer = 0;
    function placeLater() {
      clearTimeout(placeTimer);
      placeTimer = setTimeout(function () { if (snap && !cur && !pressing) showFloat(snap); }, 150);
    }
    window.addEventListener('scroll', placeLater, { passive: true });
    window.addEventListener('resize', placeLater);
    // a tap can clear the selection before "click": read it on pointerdown; mousedown must not clear it either
    floatBtn.addEventListener('pointerdown', function () { pressing = true; snap = readSelection() || snap; });
    floatBtn.addEventListener('pointercancel', function () { pressing = false; });
    window.addEventListener('pointerup', function () { setTimeout(function () { pressing = false; }, 0); }, true);
    floatBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    floatBtn.addEventListener('click', function () {
      pressing = false;
      var s = readSelection() || snap;
      if (s) openSelection(s, floatBtn); else hideFloat();
    });
    addBtn.addEventListener('pointerdown', function () { press = { s: readSelection(), t: Date.now() }; });
    addBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    addBtn.addEventListener('click', function () {
      var s = readSelection() || (press && Date.now() - press.t < 3000 ? press.s : null);
      press = null;
      if (s) openSelection(s, addBtn); else openDialog({ kind: 'general', target: '', trigger: addBtn });
    });

    /* ---- "Marchează": marking mode. A tap (or Enter on a focused block) on any part of the page marks the
       closest meaningful block: a text, heading, photo, price row, card, box, button or footer column.
       While it is on, the page's links, buttons and forms do nothing; this UI keeps working. ---- */
    var PICK = 'a, button, summary, label, input, select, textarea, img, video, p, li, h1, h2, h3, h4, h5, h6, ' +
      'figure, figcaption, tr, caption, dt, dd, blockquote, pre';
    var BOXES = '.card, .box, .quote, .result, .faq-item, .ph, .todo-box, .table-wrap, .tt-card, .form, .field, ' +
      '.foot-grid > *, .strip li';
    var TABBABLE = 'p, li, h1, h2, h3, h4, h5, h6, img, figure, figcaption, tr, caption, dt, dd, blockquote, pre, ' + BOXES;
    function clear(c) { return !c || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c); }
    function backdropOf(el) {
      for (; el && el.nodeType === 1; el = el.parentElement) {
        var b = getComputedStyle(el).backgroundColor;
        if (!clear(b)) return b;
      }
      return 'rgb(255, 255, 255)';
    }
    function looksLikeBox(el) { // a framed or tinted block, big enough to be more than an icon or a badge
      if (!(el instanceof HTMLElement) || el.classList.contains('pending')) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 40) return false;
      var cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.display === 'contents') return false;
      var sides = ['Top', 'Right', 'Bottom', 'Left'].filter(function (s) {
        return parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && !clear(cs['border' + s + 'Color']);
      }).length;
      if (sides >= 3 || cs.boxShadow !== 'none') return true;
      return !clear(cs.backgroundColor) && cs.backgroundColor !== backdropOf(el.parentElement);
    }
    function scopeOf(t) {
      for (var i = 0; i < markScopes.length; i++) if (markScopes[i].contains(t)) return markScopes[i];
      return null;
    }
    function markable(t) { return !!(t && t.nodeType === 1 && !t.closest('.rv-ui') && scopeOf(t)); }
    function pickBlock(t) {
      if (t && t.nodeType !== 1) t = t.parentElement;
      if (!markable(t)) return null;
      var scope = scopeOf(t);
      for (var el = t; el && el !== scope; el = el.parentElement) {
        if (el.matches('.foot-title') && el.parentElement.matches(BOXES)) return el.parentElement; // a footer column
        if (el.matches(PICK)) {
          // a decorative image inside a link or button: the link or button; a form field: with its label
          if (el.tagName === 'IMG' && !(el.getAttribute('alt') || '').trim() && el.closest('a, button')) return el.closest('a, button');
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.closest('.field, label')) return el.closest('.field, label');
          return el;
        }
        if (el.matches(BOXES) || looksLikeBox(el)) return el;
      }
      // a gap between blocks: the section (list, table, form) around it; the bare header or footer as a whole
      var big = t.closest('section, article, aside, nav, form, table, ul, ol, dl');
      if (big && big !== scope && scope.contains(big)) return big;
      return scope.tagName === 'MAIN' ? null : scope;
    }
    // Text as it is shown: a space between parts laid out as blocks (a price row's note, a strip item's
    // two lines), nothing from this UI or from what is not displayed.
    function shownText(node) {
      var parts = [];
      (function walk(n) {
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) { parts.push(c.data); continue; }
          if (c.nodeType !== 1 || isSkipped(c)) continue;
          var d = getComputedStyle(c).display;
          if (d === 'none') continue;
          var gap = (d !== 'inline' && d !== 'contents') || c.tagName === 'BR';
          if (gap) parts.push(' ');
          walk(c);
          if (gap) parts.push(' ');
        }
      })(node);
      return parts.join('').replace(/\s+/g, ' ').trim();
    }
    // What the dialog quotes and the server keeps as "target": the element's text (images: the alt text)
    function excerptOf(el) {
      var t = '';
      if (el.tagName === 'IMG') t = (el.getAttribute('alt') || '').trim() || 'imagine';
      else if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
        var l = el.labels && el.labels[0];
        t = (l && shownText(l)) || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
      } else {
        t = shownText(el);
        if (!t) {
          var img = el.querySelector('img');
          t = el.getAttribute('aria-label') || (img ? (img.getAttribute('alt') || '').trim() || 'imagine' : '');
        }
      }
      return clip(String(t).replace(/\s+/g, ' ').trim() || 'zonă fără text', MAX_EXCERPT);
    }
    function markElement(el, viaKeyboard) {
      if (busy || !el) return;
      setHover(null);
      el.classList.add('rv-picked');
      openDialog({ kind: 'marker', target: excerptOf(el), anchor: buildAnchor(el), el: el,
        trigger: viaKeyboard ? el : markBtn });
    }
    var hoverEl = null, tabbed = [];
    function setHover(el) {
      if (hoverEl === el) return;
      if (hoverEl) hoverEl.classList.remove('rv-hover');
      hoverEl = el;
      if (el) el.classList.add('rv-hover');
    }
    function addTabStops() { // so that blocks without a link or button can be reached with Tab, then marked with Enter
      markScopes.forEach(function (s) {
        each(s.querySelectorAll(TABBABLE), function (el) {
          if ((el.hasAttribute('tabindex') && !el.rvTmpTab) || el.closest('.rv-ui, a, button, summary, label') || !isShown(el)) return;
          var only = el.children.length === 1 && el.firstElementChild.matches('a[href], button');
          if (only && textOf(el) === textOf(el.firstElementChild)) return; // a list item that is just a link
          el.rvTmpTab = false;
          el.setAttribute('tabindex', '0');
          tabbed.push(el);
        });
      });
    }
    function removeTabStops() {
      tabbed.forEach(function (el) { if (el.getAttribute('tabindex') === '0') el.removeAttribute('tabindex'); });
      tabbed = [];
    }
    function setMarking(on) {
      if (marking === on) return;
      marking = on;
      root.classList.toggle('rv-marking', on);
      markBtn.setAttribute('aria-pressed', String(on));
      if (on) {
        var sel = window.getSelection && window.getSelection();
        if (sel) sel.removeAllRanges();
        snap = null;
        hideFloat();
        addTabStops();
      } else {
        setHover(null);
        removeTabStops();
      }
      syncHelp();
      syncBar();
    }
    markBtn.addEventListener('click', function () { setMarking(!marking); });
    var swallow = false; // the tap that closed a pin's popover only closes it
    document.addEventListener('pointerdown', function (ev) {
      swallow = false;
      if (!popEntry || pop.contains(ev.target) || ev.target === popEntry.rvPin) return;
      swallow = marking && markable(ev.target);
      hidePop(false);
    }, true);
    window.addEventListener('mousedown', function (ev) { // no focus, no text selection while marking
      if (marking && !cur && markable(ev.target)) ev.preventDefault();
    }, true);
    window.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target && ev.target.parentElement;
      if (swallow) {
        swallow = false;
        if (markable(t)) { ev.preventDefault(); ev.stopPropagation(); }
        return;
      }
      if (!marking || cur || !markable(t)) return;
      ev.preventDefault(); // no link, button, menu or form does anything while marking
      ev.stopPropagation();
      markElement(pickBlock(t), false);
    }, true);
    window.addEventListener('keydown', function (ev) {
      if (!marking || cur || ev.key !== 'Enter' || ev.isComposing || !markable(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      markElement(pickBlock(ev.target), true);
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || ev.defaultPrevented || cur) return;
      if (popEntry) { ev.preventDefault(); hidePop(true); return; }
      if (marking) { ev.preventDefault(); setMarking(false); focusQuiet(markBtn); }
    });
    // the outline under the mouse, only where there is a real mouse: after a tap, phones can send "mouse"
    // pointer events to the tapped spot, which would leave an outline on a block nobody pointed at
    var mouseHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    document.addEventListener('pointerover', function (ev) {
      if (mouseHover && marking && !cur && ev.pointerType === 'mouse') setHover(pickBlock(ev.target));
    });
    document.documentElement.addEventListener('pointerleave', function () { setHover(null); });

    /* ---- Start: buttons on the yellow texts, then the comments already saved for this page ---- */
    // The server's list replaces this one; comments already shown keep their objects (pins, the element marked
    // during this visit); only comments saved here after the request was sent, which the answer may not hold yet,
    // go last. Any other comment the server no longer lists (deleted elsewhere) is dropped with its pin.
    function load(first) {
      var since = saveSeq;
      return request('GET', null, 'page=' + encodeURIComponent(page)).then(function (res) {
        var got = res.status === 200 && res.data && res.data.entries;
        if (got && typeof got.length === 'number') {
          var n0 = got[0] && +got[0].n;
          numBase = n0 > 1 && n0 === Math.floor(n0) ? n0 - 1 : 0;
          var known = {}, fresh = {};
          entries.forEach(function (e) { if (e.id) known[e.id] = e; });
          var list = Array.prototype.map.call(got, clean).filter(Boolean).map(function (e) {
            if (e.id) fresh[e.id] = true;
            return known[e.id] || e;
          });
          entries = list.concat(entries.filter(function (e) { return !fresh[e.id] && e.rvSeq > since; }));
          refresh();
          return;
        }
        if (!first) return; // a later reload that fails keeps the list as it is
        if (res.status === 403 || res.status === 503) blocked = errorFor(res.status);
        setStatus(blocked || MSG.loadFailed, true);
        if (blocked && cur && !busy) err.textContent = blocked; // a dialog opened before the answer came
      });
    }
    decorate(document.body);
    renderPanel();
    load(true);

    // texts drawn later (price search results): "Răspunde" on their yellow prices, pins on their saved places
    return { decorate: function (scope) { decorate(scope); if (entries.length) refresh(); } };
  }

  function openWhatsApp(text) {
    var url = WA + '?text=' + encodeURIComponent(text);
    var w = window.open(url, '_blank');
    if (w) { w.opener = null; } else { window.location.href = url; }
  }

  function val(form, name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.length && !el.tagName) { // radio group
      for (var i = 0; i < el.length; i++) { if (el[i].checked) return el[i].value.trim(); }
      return '';
    }
    if (el.type === 'checkbox') return el.checked ? el.value : '';
    return (el.value || '').trim();
  }

  function selectedText(form, name) {
    var el = form.elements[name];
    if (!el || el.tagName !== 'SELECT' || el.selectedIndex < 0) return val(form, name);
    return el.value ? el.options[el.selectedIndex].text.trim() : '';
  }

  var DAYS = {
    ro: ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  };

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(s) {
    var d = parseDate(s);
    if (!d) return s;
    var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '.' + mm + '.' + d.getFullYear() + ' (' + DAYS[lang === 'en' ? 'en' : 'ro'][d.getDay()] + ')';
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  var T = {
    ro: {
      sunday: 'Duminica suntem închiși. Alege altă zi.',
      past: 'Alege o dată de azi încolo.',
      required: 'Completează câmpurile marcate cu *.',
      anyTime: 'Oricând în program',
      // price search: buttons after "no result" and after the results
      searchCall: 'Sună: 0769 146 666',
      searchWa: 'Întreabă pe WhatsApp',
      searchWaText: function (q) { return 'Bună ziua! Cât costă reparația pentru ' + q + '?'; },
      searchSamsung: 'Reparații Samsung',
      searchBook: function (m) { return m ? 'Programează pentru ' + m : 'Programează o reparație'; },
      booking: function (f) {
        var lines = ['Bună ziua! Aș dori o programare la Fix & Play Service GSM.'];
        lines.push('Telefon: ' + val(f, 'model'));
        lines.push('Problema: ' + selectedText(f, 'problema') + (val(f, 'detalii') ? ' (' + val(f, 'detalii') + ')' : ''));
        lines.push('Data dorită: ' + fmtDate(val(f, 'data')));
        lines.push('Ora dorită: ' + (selectedText(f, 'ora') || 'oricând în program'));
        if (val(f, 'nume')) lines.push('Nume: ' + val(f, 'nume'));
        lines.push('Aștept confirmarea. Mulțumesc!');
        return lines.join('\n');
      },
      status: function (f) {
        var lines = ['Bună ziua! Aș dori să aflu stadiul reparației.'];
        if (val(f, 'comanda')) lines.push('Număr comandă: ' + val(f, 'comanda')); // optional: "dacă îl ai"
        if (val(f, 'nume')) lines.push('Nume: ' + val(f, 'nume'));
        if (val(f, 'model')) lines.push('Telefon: ' + val(f, 'model'));
        lines.push('Mulțumesc!');
        return lines.join('\n');
      },
      buyback: function (f) {
        var lines = ['Bună ziua! Aș vrea o ofertă de buy-back / trade-in.'];
        lines.push('Vreau: ' + (val(f, 'scop') || 'să vând telefonul'));
        lines.push('Telefon: ' + val(f, 'model'));
        lines.push('Memorie: ' + selectedText(f, 'memorie'));
        lines.push('Stare: ' + selectedText(f, 'stare'));
        if (val(f, 'baterie')) lines.push('Sănătate baterie: ' + val(f, 'baterie') + '%');
        var acc = [val(f, 'cutie'), val(f, 'incarcator')].filter(Boolean);
        if (acc.length) lines.push('Am și: ' + acc.join(', '));
        if (val(f, 'detalii')) lines.push('Detalii: ' + val(f, 'detalii'));
        lines.push('Mulțumesc!');
        return lines.join('\n');
      }
    },
    en: {
      sunday: 'We are closed on Sundays. Please pick another day.',
      past: 'Please pick today or a later date.',
      required: 'Please fill in the fields marked *.',
      anyTime: 'Any time during opening hours',
      searchCall: 'Call +40 769 146 666',
      searchWa: 'Ask on WhatsApp',
      searchWaText: function (q) { return 'Hello! How much is the repair for ' + q + '?'; },
      searchSamsung: 'Samsung repairs',
      searchBook: function (m) { return m ? 'Book for ' + m : 'Book a repair'; },
      booking: function (f) {
        var lines = ['Hello! I would like to book a repair at Fix & Play Service GSM.'];
        lines.push('Phone: ' + val(f, 'model'));
        lines.push('Problem: ' + selectedText(f, 'problema') + (val(f, 'detalii') ? ' (' + val(f, 'detalii') + ')' : ''));
        lines.push('Preferred date: ' + fmtDate(val(f, 'data')));
        lines.push('Preferred time: ' + (selectedText(f, 'ora') || 'any time during opening hours'));
        if (val(f, 'nume')) lines.push('Name: ' + val(f, 'nume'));
        lines.push('I will wait for your confirmation. Thank you!');
        return lines.join('\n');
      },
      status: function (f) {
        var lines = ['Hello! I would like to check the status of my repair.'];
        if (val(f, 'comanda')) lines.push('Order number: ' + val(f, 'comanda')); // optional: "if you have it"
        if (val(f, 'nume')) lines.push('Name: ' + val(f, 'nume'));
        lines.push('Thank you!');
        return lines.join('\n');
      },
      buyback: function (f) {
        var lines = ['Hello! I would like a buy-back / trade-in offer.'];
        lines.push('Phone: ' + val(f, 'model'));
        lines.push('Storage: ' + selectedText(f, 'memorie'));
        lines.push('Condition: ' + selectedText(f, 'stare'));
        lines.push('Thank you!');
        return lines.join('\n');
      }
    }
  };
  var t = T[lang] || T.ro;

  /* ---- Booking: date limits and time slots inside opening hours ---- */
  function slots(day) {
    // Mon-Fri 11:00-18:00, Sat 11:00-15:00 (last slot 30 min before closing). Sunday closed.
    var end = day === 6 ? 15 : 18, out = [];
    for (var h = 11; h < end; h++) { out.push(h + ':00'); out.push(h + ':30'); }
    return out;
  }
  function fillTimes(select, day) {
    var keep = select.value;
    while (select.options.length) select.remove(0);
    select.add(new Option(t.anyTime, ''));
    if (day === 0) return;
    slots(day === undefined ? 1 : day).forEach(function (s) { select.add(new Option(s, s)); });
    if (keep) select.value = keep;
    if (select.value !== keep) select.value = '';
  }

  function checkDate(input) {
    var d = parseDate(input.value);
    var msg = '';
    if (d) {
      if (input.value < todayISO()) msg = t.past;
      else if (d.getDay() === 0) msg = t.sunday;
    }
    input.setCustomValidity(msg);
    return d;
  }

  function prefill(form) {
    var q = new URLSearchParams(window.location.search);
    q.forEach(function (v, k) {
      var el = form.elements[k];
      if (el && el.tagName && el.tagName !== 'BUTTON' && el.type !== 'checkbox') el.value = v;
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('form[data-wa]'), function (form) {
    var kind = form.getAttribute('data-wa');
    var errorEl = form.querySelector('.form-error');
    var dateEl = form.elements.data, timeEl = form.elements.ora;

    if (dateEl) {
      dateEl.min = todayISO();
      dateEl.addEventListener('change', function () {
        var d = checkDate(dateEl);
        if (timeEl) fillTimes(timeEl, d ? d.getDay() : undefined);
        if (errorEl) errorEl.textContent = dateEl.validationMessage;
      });
    }
    if (timeEl) fillTimes(timeEl);
    prefill(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (dateEl) checkDate(dateEl);
      if (!form.checkValidity()) {
        var bad = form.querySelector(':invalid');
        if (errorEl) errorEl.textContent = (bad && bad.type === 'date' && bad.value) ? bad.validationMessage : t.required;
        form.reportValidity();
        return;
      }
      if (errorEl) errorEl.textContent = '';
      openWhatsApp(t[kind](form));
    });
  });

  /* ---- Price search over inline JSON ---- */
  var dataEl = document.getElementById('price-data');
  var qEl = document.getElementById('price-q');
  var resEl = document.getElementById('price-results');
  var statusEl = document.getElementById('price-status');

  function norm(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  // neutral "no price yet" texts, and prices flagged "w": 1 in the data (waiting for the owner's confirmation):
  // marked .pending like the same cells in the static tables
  var PENDING_PRICES = ['Preț la telefon', 'Call for price'];
  function price(p, waiting) {
    return waiting || PENDING_PRICES.indexOf(p) !== -1 ? '<span class="pending">' + esc(p) + '</span>' : esc(p);
  }

  if (dataEl && qEl && resEl) {
    var data = JSON.parse(dataEl.textContent);
    var STOP = { iphone: 1, apple: 1, telefon: 1, pret: 1, preturi: 1, lei: 1 };
    var entries = data.items.map(function (it) {
      return { it: it, toks: norm(it.m + ' ' + it.c + ' ' + it.i + ' ' + (it.k || '')).split(' ') };
    });

    function search(q) {
      var qt = norm(q).split(' ').filter(function (x) { return x && !STOP[x]; });
      if (!qt.length) return null;
      var groups = [], byModel = {};
      entries.forEach(function (e) {
        var ok = qt.every(function (w) {
          return e.toks.some(function (tk) { return tk === w || (tk.indexOf(w) === 0 && isNaN(+w)); });
        });
        if (!ok) return;
        var m = e.it.m;
        if (!byModel[m]) { byModel[m] = { m: m, rows: [] }; groups.push(byModel[m]); }
        byModel[m].rows.push(e.it);
      });
      // closest model first: "13 pro" lists iPhone 13 Pro before iPhone 13 Pro Max
      var size = function (g) { return norm(g.m).split(' ').filter(function (x) { return !STOP[x]; }).length; };
      groups.forEach(function (g, i) { g.order = i; g.size = size(g); });
      groups.sort(function (a, b) { return (a.size - b.size) || (a.order - b.order); });
      return groups;
    }

    // Buttons drawn under the search (DOM only: the visitor's text never goes through innerHTML). Same-origin
    // links keep ?review like the links in the page (see "Review mode" above).
    function keepReview(href) {
      if (!query.has(REVIEW)) return href;
      return href + (href.indexOf('?') === -1 ? '?' : '&') + token;
    }
    function actionBtn(cls, href, text, iconFrom) {
      var a = document.createElement('a');
      a.className = 'btn ' + cls;
      a.href = href;
      var icon = iconFrom && document.querySelector(iconFrom);
      if (icon) a.appendChild(icon.cloneNode(true));
      var label = document.createElement('span');
      label.textContent = text;
      a.appendChild(label);
      return a;
    }
    function actionsRow(links) {
      var row = document.createElement('div');
      row.className = 'btn-row search-actions';
      links.forEach(function (a) { row.appendChild(a); });
      return row;
    }
    function noResultActions(q) {
      var asked = q.replace(/\s+/g, ' ').trim().slice(0, 60);
      var links = [
        actionBtn('btn--call', 'tel:+40769146666', t.searchCall, '.cta .btn--call svg'),
        actionBtn('btn--wa', WA + '?text=' + encodeURIComponent(t.searchWaText(asked)), t.searchWa, '.cta .btn--wa svg')
      ];
      if (/samsung|galaxy|\b[as]\d{2}\b/i.test(q)) links.push(actionBtn('btn--outline', keepReview('/reparatii-samsung/'), t.searchSamsung));
      return actionsRow(links);
    }
    // "Programează pentru <model>" names the most specific model whose words were all typed ("13 Pro" ->
    // iPhone 13 Pro, "17 pro max" -> iPhone 17 Pro Max, "s22" -> Samsung Galaxy S22); a broad search
    // ("Samsung", "iPad", "MacBook") gets the plain booking link
    var NOT_A_MODEL = { 'Servicii generale': 1 };
    var BRAND = { samsung: 1, galaxy: 1 };
    function modelWords(s) { return norm(s).split(' ').filter(function (x) { return x && !STOP[x]; }); }
    function bookAction(groups) {
      var asked = modelWords(qEl.value), model = '', best = 0;
      groups.forEach(function (g) {
        var w = modelWords(g.m).filter(function (x) { return !BRAND[x]; });
        var fits = w.length && w.every(function (x) { return asked.indexOf(x) !== -1; });
        if (fits && w.length > best && !NOT_A_MODEL[g.m]) { model = g.m; best = w.length; }
      });
      var href = '/programare/' + (model ? '?model=' + encodeURIComponent(model) : '');
      return actionsRow([actionBtn('btn--primary', keepReview(href), t.searchBook(model))]);
    }

    function render() {
      var groups = search(qEl.value);
      if (!groups) { resEl.innerHTML = ''; statusEl.textContent = data.hint; return; }
      if (!groups.length) {
        resEl.innerHTML = '';
        statusEl.textContent = data.none;
        resEl.appendChild(noResultActions(qEl.value));
        return;
      }
      // Romanian count agreement: "1 rezultat" (found1), "2-12 rezultate" (found); above max the
      // "many" text names no count, so it never needs "de" (20 de rezultate). 0 results use "none" above.
      var max = 12, n = groups.length;
      statusEl.textContent = n > max ? data.many.replace('{n}', n).replace('{max}', max)
        : (n === 1 && data.found1 ? data.found1 : data.found).replace('{n}', n);
      resEl.innerHTML = groups.slice(0, max).map(function (g) {
        return '<article class="result"><h3>' + esc(g.m) + '</h3><dl>' + g.rows.map(function (r) {
          return '<dt>' + esc(r.c + (r.i ? ': ' + r.i : '')) + '</dt><dd>' + price(r.p, r.w) +
            (r.s ? ' <span class="mark" aria-hidden="true">*</span>' : '') +
            (r.n ? '<small>' + esc(r.n) + '</small>' : '') + '</dd>';
        }).join('') + '</dl></article>';
      }).join('');
      resEl.appendChild(bookAction(groups));
      if (reviewUI) reviewUI.decorate(resEl); // "Răspunde" also on the yellow prices in the results
    }

    // On touch screens only: after a chosen search (chip, "Caută", or arriving with ?q= from the homepage) the
    // keyboard closes and the page scrolls to the results (html scroll-padding-top keeps them below the sticky
    // header). With a mouse/keyboard the field keeps focus and the page stays put. Typing never moves the page.
    function showResults() {
      if (!window.matchMedia('(pointer: coarse)').matches) return;
      qEl.blur();
      if (statusEl) statusEl.scrollIntoView({ block: 'start' });
    }
    qEl.addEventListener('input', render);
    var form = qEl.form;
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); render(); showResults(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-q]'), function (b) {
      b.addEventListener('click', function () { qEl.value = b.getAttribute('data-q'); render(); showResults(); });
    });
    var initial = new URLSearchParams(window.location.search).get('q');
    if (initial) qEl.value = initial;
    render();
    if (initial) showResults();
  }

  /* ---- TikTok click-to-load ---- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-tiktok]'), function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-tiktok');
      if (!/^\d+$/.test(id)) return;
      var f = document.createElement('iframe');
      f.className = 'tt-frame';
      f.src = 'https://www.tiktok.com/player/v1/' + id + '?autoplay=1&rel=0';
      f.title = btn.getAttribute('data-title') || 'TikTok';
      f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
      f.setAttribute('allowfullscreen', '');
      f.loading = 'lazy';
      btn.replaceWith(f);
      f.focus(); // keyboard and screen reader users stay on the clip they opened
    });
  });
})();
