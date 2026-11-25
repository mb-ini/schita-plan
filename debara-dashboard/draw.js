(() => {
  const loc = d3.formatLocale({decimal: ',', thousands: '.', grouping: [3], currency: ['', '']});
  const f0 = loc.format(',.0f');
  const f1 = loc.format(',.1f');
  const f2 = loc.format(',.2f');
  const deLei = (v) => {
    const n = Math.abs(Math.round(v));
    const r = n % 100;
    return (r >= 20 || (r === 0 && n >= 100)) ? ' de lei' : ' lei';
  };
  const fmt = (kind, v) => {
    if (v == null || v === '') return '—';
    switch (kind) {
      case 'lei': return f0(v) + ' lei';
      case 'leiFraza': return f0(v) + deLei(v);
      case 'pret': return (Number.isInteger(v) ? f0(v) : f2(v)) + ' lei';
      case 'signedLei': return (v > 0 ? '+' : v < 0 ? '-' : '') + f0(Math.abs(v)) + ' lei';
      case 'semn': return v > 0 ? 'mai mult' : v < 0 ? 'mai puțin' : 'la fel';
      case 'loc': return 'locul ' + f0(v);
      case 'n0': return f0(v);
      case 'n1': return f1(v);
      case 'n2': return f2(v);
      case 'db': return f0(v) + ' dB';
      case 'data': { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v); }
      default: return String(v);
    }
  };
  const ready = (el, ...ids) => {
    const st = ids.map((id) => dash.data(id));
    const isBox = el.matches('.dd-chart, tbody, .dd-grid, .dd-wlist');
    if (st.some((s) => s.status === 'loading')) {
      if (isBox) el.replaceChildren(); else el.textContent = '—';
      el.classList.add('dash-skeleton');
      return null;
    }
    el.classList.remove('dash-skeleton');
    const bad = st.find((s) => s.status !== 'ok');
    if (bad) {
      el.replaceChildren();
      if (bad.status === 'error' && isBox) {
        const p = document.createElement(el.matches('tbody') ? 'tr' : 'p');
        if (el.matches('tbody')) { const td = document.createElement('td'); td.colSpan = 9; td.textContent = 'Datele din foaie nu s-au putut încărca.'; p.append(td); }
        else { p.className = 'dd-err'; p.textContent = 'Datele din foaie nu s-au putut încărca.'; }
        el.append(p);
      } else if (!isBox) el.textContent = '—';
      return null;
    }
    return st.map((s) => s.data);
  };
  const tip = (box) => {
    let t = box.querySelector(':scope > .dd-tip');
    if (!t) { t = document.createElement('div'); t.className = 'dd-tip'; box.append(t); }
    return {
      show(ev, lines) {
        t.replaceChildren(...lines.map((l) => {
          const d = document.createElement('div');
          if (Array.isArray(l)) {
            const k = document.createElement('span'); k.className = 'k'; k.textContent = l[0] + ': ';
            d.append(k, document.createTextNode(l[1]));
          } else { d.className = 'h'; d.textContent = l; }
          return d;
        }));
        t.style.display = 'block';
        const r = box.getBoundingClientRect();
        const x = ev.clientX - r.left;
        const y = ev.clientY - r.top;
        const w = t.offsetWidth;
        const h = t.offsetHeight;
        let left = x + 12;
        if (left + w > r.width) left = Math.max(0, x - w - 12);
        let top = y - h - 10;
        if (top < 0) top = Math.min(y + 14, Math.max(0, r.height - h));
        t.style.left = left + 'px';
        t.style.top = top + 'px';
      },
      hide() { t.style.display = 'none'; }
    };
  };
  const mark = (node, source, field, key, value) => {
    node.dataset.source = source;
    node.dataset.field = field;
    node.dataset.where = key + '=' + value;
  };
  window.Dx = {fmt, ready, tip, mark};
})();

// O singură valoare: data-source, data-field, data-where="cheie=valoare", data-fmt
dash.draw('cell', (el) => {
  const d = Dx.ready(el, el.dataset.source);
  if (!d) return;
  const rows = Array.isArray(d[0]) ? d[0] : [];
  const [k, v] = String(el.dataset.where || '').split('=');
  const row = rows.find((r) => String(r[k]) === v);
  const val = row ? row[el.dataset.field] : null;
  el.textContent = Dx.fmt(el.dataset.fmt || 'txt', val);
});

dash.draw('weights', (el) => {
  const d = Dx.ready(el, 'weights');
  if (!d) return;
  const rows = d[0];
  const max = d3.max(rows, (r) => r.pondere) || 1;
  el.replaceChildren(...rows.map((r, i) => {
    const row = document.createElement('div'); row.className = 'dd-wrow';
    const lab = document.createElement('span'); lab.className = 'dd-wlab'; lab.textContent = r.criteriu;
    lab.dataset.source = 'weights'; lab.dataset.field = 'criteriu'; lab.dataset.row = String(i);
    const track = document.createElement('span'); track.className = 'dd-wtrack';
    const bar = document.createElement('span'); bar.className = 'dd-wbar';
    bar.style.width = ((r.pondere || 0) / max * 100) + '%';
    bar.style.background = dash.colors[0];
    track.append(bar);
    const val = document.createElement('span'); val.className = 'dd-wval';
    val.textContent = r.pondere == null ? '—' : f(r.pondere) + '%';
    val.dataset.source = 'weights'; val.dataset.field = 'pondere'; val.dataset.row = String(i);
    row.append(lab, track, val);
    return row;
  }));
  function f(v) { return Dx.fmt('n0', v); }
});

dash.draw('dtest', (el) => {
  const d = Dx.ready(el, 'dtest');
  if (!d) return;
  const rows = d[0].filter((r) => r.marca).slice().sort((a, b) => (b.uscFiab ?? -1) - (a.uscFiab ?? -1));
  const W = Math.max(280, el.clientWidth || 0);
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', W)
    .attr('role', 'img').attr('aria-label', 'Indicele de fiabilitate dTest pe mărci, la uscătoare și la mașini de spălat');
  const lab = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'dd-lbl').text((r) => r.marca);
  const leftW = d3.max(lab.nodes(), (n) => n.getComputedTextLength()) || 60;
  const vals = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'dd-lbl dd-num')
    .text((r) => `${r.uscFiab ?? '–'} / ${r.masFiab ?? '–'}`);
  const rightW = d3.max(vals.nodes(), (n) => n.getComputedTextLength()) || 40;
  const m = {top: 22, right: rightW + 14, bottom: 6, left: leftW + 12};
  const rowH = 26;
  const H = m.top + rows.length * rowH + m.bottom;
  svg.attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const nums = rows.flatMap((r) => [r.uscFiab, r.masFiab]).filter((v) => typeof v === 'number');
  const x = d3.scaleLinear().domain([Math.min(70, d3.min(nums) - 2), Math.max(96, d3.max(nums) + 2)]).range([m.left, W - m.right]);
  const yc = (i) => m.top + i * rowH + rowH / 2;
  const ticks = x.ticks(Math.max(2, Math.floor((W - m.left - m.right) / 55)));
  svg.insert('g', ':first-child').selectAll('line').data(ticks).join('line')
    .attr('x1', x).attr('x2', x).attr('y1', m.top - 4).attr('y2', H - m.bottom).style('stroke', 'var(--cds-chart-grid)');
  svg.append('g').attr('class', 'dd-axis').attr('transform', `translate(0,${m.top - 6})`)
    .call(d3.axisTop(x).tickValues(ticks).tickSize(0)).call((g) => g.select('.domain').remove());
  svg.append('line').attr('x1', x(80)).attr('x2', x(80)).attr('y1', m.top - 4).attr('y2', H - m.bottom)
    .style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '4 3');
  lab.attr('x', m.left - 8).attr('y', (r, i) => yc(i)).attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
    .classed('dd-strong', (r) => r.marca === 'Bosch' || r.marca === 'Samsung');
  vals.attr('x', W - 2).attr('y', (r, i) => yc(i)).attr('text-anchor', 'end').attr('dominant-baseline', 'middle');
  const g = svg.append('g');
  rows.forEach((r, i) => {
    const u = typeof r.uscFiab === 'number' ? r.uscFiab : null;
    const w = typeof r.masFiab === 'number' ? r.masFiab : null;
    if (u != null && w != null) g.append('line').attr('x1', x(u)).attr('x2', x(w)).attr('y1', yc(i)).attr('y2', yc(i)).style('stroke', 'var(--cds-chart-muted)').style('stroke-width', 2);
    if (w != null) g.append('circle').attr('cx', x(w)).attr('cy', yc(i)).attr('r', 5).style('fill', dash.colors[1]);
    if (u != null) g.append('circle').attr('cx', x(u)).attr('cy', yc(i)).attr('r', 5).style('fill', dash.colors[0]);
  });
  const t = Dx.tip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', 0).attr('width', W).attr('y', (r, i) => m.top + i * rowH).attr('height', rowH).style('fill', 'transparent')
    .on('pointermove', (ev, r) => t.show(ev, [
      r.marca,
      ['Uscătoare: fiabilitate', r.uscFiab ?? 'nu apare'],
      ['Uscătoare: satisfacție', r.uscSatisf ?? 'nu apare'],
      ['Durata medie de viață', r.uscDurata || '—'],
      ['Defecte peste medie', r.uscDefecte || '—'],
      ['Mașini: fiabilitate', r.masFiab ?? '—'],
      ['Mașini: satisfacție', r.masSatisf ?? '—']
    ]))
    .on('pointerleave', () => t.hide());
});

dash.draw('semnaleChart', (el) => {
  const d = Dx.ready(el, 'semnale');
  if (!d) return;
  const rows = d[0];
  const W = Math.max(280, el.clientWidth || 0);
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', W)
    .attr('role', 'img').attr('aria-label', 'Câte constatări favorabile, neutre și nefavorabile are fiecare marcă');
  const lab = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'dd-lbl').text((r) => r.marca);
  const leftW = d3.max(lab.nodes(), (n) => n.getComputedTextLength()) || 60;
  const m = {top: 4, right: 26, bottom: 4, left: leftW + 10};
  const rowH = 26;
  const H = m.top + rows.length * rowH + m.bottom;
  svg.attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.total) || 1]).range([m.left, W - m.right]);
  lab.attr('x', m.left - 8).attr('y', (r, i) => m.top + i * rowH + rowH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle');
  const keys = [['favorabil', 'var(--color-ok)'], ['neutru', 'var(--cds-chart-muted)'], ['nefavorabil', 'var(--color-bad)']];
  rows.forEach((r, i) => {
    let acc = 0;
    const yy = m.top + i * rowH + 5;
    const bh = rowH - 10;
    keys.forEach(([k, col]) => {
      const v = r[k];
      if (!v) return;
      const xa = x(acc);
      const xb = x(acc + v);
      svg.append('rect').attr('x', xa).attr('y', yy).attr('width', Math.max(0, xb - xa - 1)).attr('height', bh).attr('rx', 2).style('fill', col);
      if (xb - xa > 16) svg.append('text').attr('class', 'dd-inbar').attr('x', (xa + xb) / 2).attr('y', yy + bh / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').text(v);
      acc += v;
    });
    svg.append('text').attr('class', 'dd-lbl dd-num').attr('x', x(r.total) + 6).attr('y', m.top + i * rowH + rowH / 2)
      .attr('dominant-baseline', 'middle').text(r.total);
  });
  const t = Dx.tip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', 0).attr('width', W).attr('y', (r, i) => m.top + i * rowH).attr('height', rowH).style('fill', 'transparent')
    .on('pointermove', (ev, r) => t.show(ev, [r.marca, ['Favorabile', String(r.favorabil)], ['Neutre', String(r.neutru)], ['Nefavorabile', String(r.nefavorabil)]]))
    .on('pointerleave', () => t.hide());
});

dash.draw('brandCards', (el) => {
  const d = Dx.ready(el, 'findings', 'semnale');
  if (!d) return;
  const [fs, sem] = d;
  const sums = fs.filter((r) => /^Rezumat/.test(r.tipSursa));
  el.replaceChildren(...sums.map((r) => {
    const c = document.createElement('div'); c.className = 'dd-card dd-brand';
    const h = document.createElement('h3'); h.textContent = r.marca; Dx.mark(h, 'findings', 'marca', 'rand', r.rand);
    const p = document.createElement('p'); p.textContent = r.constatare; Dx.mark(p, 'findings', 'constatare', 'rand', r.rand);
    const line = document.createElement('div'); line.className = 'dd-counts';
    const s = sem.find((x) => x.marca === r.marca);
    if (s) {
      [['favorabil', 'favorabile', 'dd-good'], ['neutru', 'neutre', 'dd-muted'], ['nefavorabil', 'nefavorabile', 'dd-bad']].forEach(([k, label, cls]) => {
        const w = document.createElement('span');
        const b = document.createElement('b'); b.className = cls; b.textContent = String(s[k]);
        Dx.mark(b, 'semnale', k, 'marca', s.marca);
        w.append(document.createTextNode(label + ' '), b);
        line.append(w);
      });
    }
    c.append(h, p, line);
    return c;
  }));
});

dash.draw('brandSel', (sel) => {
  const s = dash.data('findings');
  const brands = s.status === 'ok' ? [...new Set(s.data.map((r) => r.marca).filter(Boolean))] : [];
  const cur = window.ddBrand || '';
  sel.replaceChildren(new Option('Toate mărcile', ''), ...brands.map((b) => new Option(b, b)));
  sel.value = brands.includes(cur) ? cur : '';
  sel.onchange = () => { window.ddBrand = sel.value; dash.draw('findingsBody'); };
});

dash.draw('findingsBody', (tb) => {
  const d = Dx.ready(tb, 'dovezi');
  if (!d) return;
  const brand = window.ddBrand || '';
  const apr = window.ddApr || '';
  const list = d[0].filter((r) => (!brand || r.marca === brand) && (!apr || r.apropiere === apr));
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const cols = ['marca', 'data', 'aparat', 'model', 'apropiere', 'constatare', 'persoane', 'semnal', 'tipSursa', 'eticheta'];
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.rand;
    cols.forEach((c, i) => {
      const td = document.createElement('td');
      td.dataset.label = labels[i] || '';
      if (c === 'eticheta' && /^https?:\/\//.test(r.url)) {
        const a = document.createElement('a');
        a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.eticheta || 'sursa';
        td.append(a);
      } else td.textContent = r[c] || '—';
      if (c === 'semnal') td.className = r.semnal === 'favorabil' ? 'dd-good' : r.semnal === 'nefavorabil' ? 'dd-bad' : 'dd-muted';
      if (c === 'constatare') td.className = 'dd-wide';
      if (c === 'apropiere' && r.apropiere === 'modelul exact') td.className = 'dd-strongtxt';
      tr.append(td);
    });
    return tr;
  }));
});

dash.draw('scatter', (el) => {
  const d = Dx.ready(el, 'combos', 'candidati', 'frontiera');
  if (!d) return;
  const [rows, cand, front] = d;
  const pts = rows.filter((r) => r.cost12 != null && r.scor != null);
  const W = Math.max(280, el.clientWidth || 0);
  const H = Math.round(Math.min(380, Math.max(260, W * 0.6)));
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', 'Scorul total față de costul pe 12 ani, pentru fiecare combinație de uscător și mașină');
  const y = d3.scaleLinear().domain(d3.extent(pts, (r) => r.scor)).nice();
  const yt = y.ticks(5);
  const probe = svg.append('g').attr('class', 'dd-axis');
  const tw = d3.max(yt.map((v) => probe.append('text').text(Dx.fmt('n1', v)).node().getComputedTextLength())) || 24;
  probe.remove();
  const m = {top: 12, right: 18, bottom: 26, left: tw + 12};
  y.range([H - m.bottom, m.top]);
  const x = d3.scaleLinear().domain(d3.extent(pts, (r) => r.cost12)).nice().range([m.left, W - m.right]);
  const nx = Math.max(2, Math.floor((W - m.left - m.right) / 85));
  svg.append('g').selectAll('line').data(yt).join('line')
    .attr('x1', m.left).attr('x2', W - m.right).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
  svg.append('g').attr('class', 'dd-axis').attr('transform', `translate(0,${H - m.bottom})`)
    .call(d3.axisBottom(x).ticks(nx).tickFormat((v) => Dx.fmt('n0', v)).tickSizeOuter(0))
    .call((g) => g.selectAll('.domain, .tick line').style('stroke', 'var(--cds-chart-axis)'));
  svg.append('g').attr('class', 'dd-axis').attr('transform', `translate(${m.left},0)`)
    .call(d3.axisLeft(y).tickValues(yt).tickFormat((v) => Dx.fmt('n1', v)).tickSize(0).tickPadding(6))
    .call((g) => g.select('.domain').remove());
  if (front.length > 1) {
    svg.append('path').attr('d', d3.line().curve(d3.curveStepAfter)(front.map((r) => [x(r.cost12), y(r.scor)])))
      .style('fill', 'none').style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5).style('stroke-dasharray', '5 3');
  }
  const byPair = new Map(cand.map((c) => [c.pereche, c]));
  svg.append('g').selectAll('circle').data(pts.slice().sort((a, b) => (a.aceeasiMarca === 'da') - (b.aceeasiMarca === 'da'))).join('circle')
    .attr('cx', (r) => x(r.cost12)).attr('cy', (r) => y(r.scor)).attr('r', (r) => byPair.has(r.pereche) ? 6 : 4)
    .style('fill', (r) => r.aceeasiMarca === 'da' ? dash.colors[0] : 'var(--cds-chart-muted)')
    .style('fill-opacity', (r) => r.aceeasiMarca === 'da' ? 0.95 : 0.5)
    .style('stroke', (r) => byPair.has(r.pereche) ? 'var(--color-fg)' : 'none').style('stroke-width', 1.5);
  pts.filter((r) => byPair.has(r.pereche)).forEach((r) => {
    const cx = x(r.cost12);
    const right = cx > W - 40;
    svg.append('text').attr('class', 'dd-plab').attr('x', right ? cx - 9 : cx + 9).attr('y', y(r.scor) - 8)
      .attr('text-anchor', right ? 'end' : 'start').text(byPair.get(r.pereche).eticheta);
  });
  const del = d3.Delaunay.from(pts, (r) => x(r.cost12), (r) => y(r.scor));
  const t = Dx.tip(el);
  const ring = svg.append('circle').attr('r', 9).style('fill', 'none').style('stroke', 'var(--color-fg)').style('display', 'none');
  svg.append('rect').attr('x', m.left).attr('y', m.top).attr('width', W - m.left - m.right).attr('height', H - m.top - m.bottom)
    .style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx, my] = d3.pointer(ev);
      const r = pts[del.find(mx, my)];
      if (!r) return;
      const dx = x(r.cost12) - mx;
      const dy = y(r.scor) - my;
      if (dx * dx + dy * dy > 1200) { t.hide(); ring.style('display', 'none'); return; }
      ring.attr('cx', x(r.cost12)).attr('cy', y(r.scor)).style('display', null);
      t.show(ev, [r.pereche, ['Locul', Dx.fmt('n0', r.loc)], ['Scor', Dx.fmt('n2', r.scor)], ['Cost pe 12 ani', Dx.fmt('lei', r.cost12)], ['Cumpărare după cash-back', Dx.fmt('lei', r.cumparare)], ['Kit', r.kit]]);
    })
    .on('pointerleave', () => { t.hide(); ring.style('display', 'none'); });
});

dash.draw('ranking', (tb) => {
  const d = Dx.ready(tb, 'combos', 'candidati');
  if (!d) return;
  const [rows, cand] = d;
  const modeEl = document.querySelector('#dd-rank-mode');
  const mode = modeEl ? modeEl.value : 'toate';
  const candSet = new Set(cand.map((c) => c.pereche));
  let list = rows.filter((r) => r.loc != null).slice().sort((a, b) => a.loc - b.loc);
  list = mode === 'marca' ? list.filter((r) => r.aceeasiMarca === 'da') : list.slice(0, 15);
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const max = d3.max(rows, (r) => r.scor) || 10;
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    if (candSet.has(r.pereche)) tr.className = 'dd-hl';
    const cells = [
      [Dx.fmt('n0', r.loc), 'num'],
      [r.pereche, 'dd-pair'],
      [Dx.fmt('n2', r.scor), 'num'],
      [Dx.fmt('lei', r.cumparare), 'num'],
      [Dx.fmt('lei', r.cost12), 'num'],
      [Dx.fmt('n2', r.fiabilitate), 'num'],
      [r.geam || '—', '']
    ];
    cells.forEach(([txt, cls], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      td.dataset.label = labels[i] || '';
      if (i === 2) {
        const bar = document.createElement('span');
        bar.className = 'dd-sbar';
        bar.style.width = Math.max(0, (r.scor || 0) / max * 100) + '%';
        bar.style.background = dash.colors[0];
        td.append(bar);
      }
      tr.append(td);
    });
    return tr;
  }));
});

dash.draw('offersBody', (tb) => {
  const d = Dx.ready(tb, 'offers');
  if (!d) return;
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  tb.replaceChildren(...d[0].map((r) => {
    const tr = document.createElement('tr');
    if (r.observatie && /Cel mai mic/.test(r.observatie)) tr.className = 'dd-hl';
    const cells = [
      [r.model, ''], [r.aparat, ''], [r.magazin, ''], [Dx.fmt('pret', r.pret), 'num'],
      [r.stoc || '—', ''], [r.cashback || '—', ''], [Dx.fmt('data', r.verificat), 'num'], [r.observatie || '—', 'dd-wide']
    ];
    cells.forEach(([txt, cls], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      td.dataset.label = labels[i] || '';
      tr.append(td);
    });
    return tr;
  }));
});

document.querySelectorAll('#dd-rank-mode').forEach((s) => s.addEventListener('change', () => dash.draw('ranking')));
document.querySelectorAll('.dd-sw-0').forEach((e) => { e.style.background = dash.colors[0]; });
document.querySelectorAll('.dd-sw-1').forEach((e) => { e.style.background = dash.colors[1]; });
[2, 3, 4, 5].forEach((i) => document.querySelectorAll('.dd-sw-' + i).forEach((e) => { e.style.background = dash.colors[i]; }));
document.querySelectorAll('#dd-apr').forEach((s) => s.addEventListener('change', () => { window.ddApr = s.value; dash.draw('findingsBody'); }));
document.querySelectorAll('#dd-unghi').forEach((s) => s.addEventListener('change', () => dash.draw('unghiBody')));
