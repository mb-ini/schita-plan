// Contribuțiile la scor pentru A, B, C
dash.draw('contrib', (el) => {
  const d = Dx.ready(el, 'contributii');
  if (!d) return;
  const rows = d[0].filter((r) => r.id !== 'dif-a-b');
  const keys = ['uscator', 'cost', 'masina', 'fiabilitate', 'logistica', 'zgomot'];
  const names = {uscator: 'Uscător', cost: 'Cost', masina: 'Mașină', fiabilitate: 'Fiabilitate', logistica: 'Logistică', zgomot: 'Zgomot și vapori'};
  const W = Math.max(280, el.clientWidth || 0);
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', W)
    .attr('role', 'img').attr('aria-label', 'Din ce criterii e făcut scorul variantelor A, B și C');
  const lab = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'dd-lbl').text((r) => r.eticheta);
  const narrow = W < 460;
  const leftW = narrow ? 0 : (d3.max(lab.nodes(), (n) => n.getComputedTextLength()) || 80) + 10;
  const rowH = narrow ? 50 : 34;
  const barH = 20;
  const m = {top: 4, right: 40, bottom: 4, left: leftW};
  const H = m.top + rows.length * rowH + m.bottom;
  svg.attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.total) || 10]).range([m.left, W - m.right]);
  lab.attr('x', narrow ? 0 : leftW - 10).attr('y', (r, i) => m.top + i * rowH + (narrow ? 10 : rowH / 2))
    .attr('text-anchor', narrow ? 'start' : 'end').attr('dominant-baseline', 'middle');
  const t = Dx.tip(el);
  rows.forEach((r, i) => {
    let acc = 0;
    const yy = m.top + i * rowH + (narrow ? 22 : (rowH - barH) / 2);
    keys.forEach((k, j) => {
      const v = r[k] || 0;
      const xa = x(acc);
      const xb = x(acc + v);
      svg.append('rect').attr('x', xa).attr('y', yy).attr('width', Math.max(0, xb - xa - 1)).attr('height', barH)
        .style('fill', dash.colors[j % dash.colors.length])
        .on('pointermove', (ev) => t.show(ev, [r.eticheta, [names[k], Dx.fmt('n2', v) + ' puncte'], ['Scor total', Dx.fmt('n2', r.total)]]))
        .on('pointerleave', () => t.hide());
      if (xb - xa > 30) svg.append('text').attr('class', 'dd-inbar').attr('x', (xa + xb) / 2).attr('y', yy + barH / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').style('pointer-events', 'none').text(Dx.fmt('n1', v));
      acc += v;
    });
    svg.append('text').attr('class', 'dd-lbl dd-num').attr('x', x(r.total) + 6).attr('y', yy + barH / 2)
      .attr('dominant-baseline', 'middle').text(Dx.fmt('n2', r.total));
  });
});

// Diferențele A minus B, pe criterii
dash.draw('difAB', (el) => {
  const d = Dx.ready(el, 'contributii');
  if (!d) return;
  const r = d[0].find((x) => x.id === 'dif-a-b');
  if (!r) { el.textContent = '—'; return; }
  const keys = [['uscator', 'uscător'], ['cost', 'cost'], ['masina', 'mașină'], ['fiabilitate', 'fiabilitate'], ['logistica', 'logistică'], ['zgomot', 'zgomot și vapori']];
  el.replaceChildren(...keys.map(([k, n]) => {
    const chip = document.createElement('span');
    chip.className = 'dd-chip ' + (r[k] > 0 ? 'dd-chip-a' : r[k] < 0 ? 'dd-chip-b' : '');
    const b = document.createElement('b');
    b.textContent = (r[k] > 0 ? '+' : '') + Dx.fmt('n2', r[k]);
    b.dataset.source = 'contributii'; b.dataset.field = k; b.dataset.where = 'id=dif-a-b';
    chip.append(document.createTextNode(n + ' '), b);
    return chip;
  }));
});

// Tabel A/B/C: scor acum și dacă testul ar fi pe modelul exact
dash.draw('dacaBody', (tb) => {
  const d = Dx.ready(tb, 'dacaIncredere');
  if (!d) return;
  const order = ['samsung', 'bosch-s6-nou', 'bosch-s8'];
  const names = {samsung: 'A · Samsung', 'bosch-s6-nou': 'B · Bosch cu WQN246D1BY', 'bosch-s8': 'C · Bosch cu Serie 8'};
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const rows = order.map((id) => d[0].find((r) => r.id === id)).filter(Boolean);
  tb.replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.id;
    if (r.id === 'bosch-s6-nou') tr.className = 'dd-hl';
    [[names[r.id], ''], [Dx.fmt('n2', r.incredere), 'num'], [Dx.fmt('n2', r.scor), 'num'], [Dx.fmt('n0', r.loc), 'num'], [Dx.fmt('n2', r.scorNou), 'num'], [Dx.fmt('n0', r.locNou), 'num']].forEach(([txt, cls], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      td.dataset.label = labels[i] || '';
      tr.append(td);
    });
    return tr;
  }));
});

// Clasament pe aparate (uscătoare sau mașini), după scorul mediu în pereche
dash.draw('aparateBody', (tb) => {
  const d = Dx.ready(tb, 'peAparat');
  if (!d) return;
  const tip = tb.dataset.tip;
  const rows = d[0].filter((r) => r.tip === tip).sort((a, b) => b.scorMediu - a.scorMediu);
  const max = d3.max(d[0].filter((r) => r.tip !== 'amplitudine'), (r) => r.scorMaxim) || 10;
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  tb.replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.id;
    [[r.nume || r.model, ''], [r.model, 'dd-muted'], [Dx.fmt('n2', r.scorMediu), 'num'], [Dx.fmt('n2', r.scorMaxim), 'num']].forEach(([txt, cls], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      td.dataset.label = labels[i] || '';
      if (i === 2) {
        const bar = document.createElement('span');
        bar.className = 'dd-sbar';
        bar.style.width = Math.max(0, r.scorMediu / max * 100) + '%';
        bar.style.background = dash.colors[tip === 'uscător' ? 0 : 1];
        td.append(bar);
      }
      tr.append(td);
    });
    return tr;
  }));
});

// Frontiera cost–scor
dash.draw('frontieraBody', (tb) => {
  const d = Dx.ready(tb, 'frontiera', 'candidati');
  if (!d) return;
  const [rows, cand] = d;
  const candSet = new Set(cand.map((c) => c.pereche));
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  tb.replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    if (candSet.has(r.pereche)) tr.className = 'dd-hl';
    [[r.pereche, ''], [Dx.fmt('lei', r.cost12), 'num'], [Dx.fmt('n2', r.scor), 'num'], [Dx.fmt('n0', r.loc), 'num'], [r.aceeasiMarca, '']].forEach(([txt, cls], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      td.dataset.label = labels[i] || '';
      tr.append(td);
    });
    return tr;
  }));
});

// Clasament după criteriul ales
dash.draw('unghiBody', (tb) => {
  const d = Dx.ready(tb, 'combos', 'candidati');
  if (!d) return;
  const [rows, cand] = d;
  const sel = document.querySelector('#dd-unghi');
  const [field, dir] = String(sel ? sel.value : 'scor|desc').split('|');
  const candSet = new Set(cand.map((c) => c.pereche));
  let list = rows.slice();
  if (field === 'sigur') list = list.filter((r) => r.aceeasiMarca === 'da' && /^da/.test(r.geam));
  const key = field === 'sigur' ? 'scor' : field;
  const sign = dir === 'asc' ? 1 : -1;
  list = list.filter((r) => r[key] != null).sort((a, b) => sign * (a[key] - b[key]) || b.scor - a.scor).slice(0, 10);
  const table = tb.closest('table');
  const ths = [...table.querySelectorAll('thead th')];
  const labels = ths.map((th) => th.textContent.trim());
  ths.forEach((th) => th.classList.toggle('dd-sorted', th.dataset.field === key));
  const cols = [['pereche', (r) => r.pereche, ''], ['cumparare', (r) => Dx.fmt('lei', r.cumparare), 'num'], ['cost12', (r) => Dx.fmt('lei', r.cost12), 'num'],
    ['fiabilitate', (r) => Dx.fmt('n2', r.fiabilitate), 'num'], ['notaUscator', (r) => Dx.fmt('n2', r.notaUscator), 'num'], ['zgomot', (r) => Dx.fmt('n0', r.zgomot), 'num'],
    ['vapori', (r) => Dx.fmt('n0', r.vapori), 'num'], ['scor', (r) => Dx.fmt('n2', r.scor), 'num'], ['loc', (r) => Dx.fmt('n0', r.loc), 'num']];
  tb.replaceChildren(...list.map((r, idx) => {
    const tr = document.createElement('tr');
    if (candSet.has(r.pereche)) tr.className = 'dd-hl';
    const first = document.createElement('td');
    first.textContent = String(idx + 1); first.className = 'num'; first.dataset.label = labels[0] || '';
    tr.append(first);
    cols.forEach(([k, f, cls], i) => {
      const td = document.createElement('td');
      td.textContent = f(r);
      td.className = (cls + (k === key ? ' dd-sorted' : '')).trim();
      td.dataset.label = labels[i + 1] || '';
      tr.append(td);
    });
    return tr;
  }));
});

// Harta stabilității: locul fiecărei perechi pe fiecare set de ponderi
dash.draw('heatmap', (el) => {
  const d = Dx.ready(el, 'scoruriProfil', 'profiluri', 'candidati');
  if (!d) return;
  const [rows, prof, cand] = d;
  const candMap = new Map(cand.map((c) => [c.pereche, c.eticheta]));
  const list = rows.filter((r) => r.inTop5 > 0).sort((a, b) => a.locMediu - b.locMediu || a.locFoaie - b.locFoaie);
  const table = document.createElement('table');
  table.className = 'dd-heat';
  table.dataset.source = 'scoruriProfil';
  table.dataset.rowKey = 'pereche';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const mk = (tag, txt, field, cls) => { const c = document.createElement(tag); c.textContent = txt; if (field) c.dataset.field = field; if (cls) c.className = cls; return c; };
  hr.append(mk('th', '', null, 'dd-heat-var'), mk('th', 'Pereche', 'pereche', 'dd-heat-pair'));
  prof.forEach((p) => hr.append(mk('th', p.nume, 'loc_' + p.id, 'dd-heat-col')));
  hr.append(mk('th', 'De câte ori în primele 5', 'inTop5', 'dd-heat-col'), mk('th', 'Locul mediu', 'locMediu', 'dd-heat-col'));
  thead.append(hr);
  const tbody = document.createElement('tbody');
  const shade = (l) => l === 1 ? 80 : l <= 3 ? 55 : l <= 5 ? 38 : l <= 10 ? 20 : l <= 20 ? 9 : 0;
  list.forEach((r) => {
    const tr = document.createElement('tr');
    tr.append(mk('td', candMap.get(r.pereche) || '', null, 'dd-heat-var'), mk('td', r.pereche, null, 'dd-heat-pair'));
    prof.forEach((p) => {
      const l = r['loc_' + p.id];
      const td = mk('td', String(l), null, 'dd-heat-cell');
      const s = shade(l);
      td.style.background = s ? `color-mix(in srgb, ${dash.colors[0]} ${s}%, transparent)` : 'transparent';
      if (s >= 55) td.style.color = 'var(--color-bg)';
      tr.append(td);
    });
    tr.append(mk('td', String(r.inTop5) + ' din ' + prof.length, null, 'dd-heat-cell'), mk('td', Dx.fmt('n1', r.locMediu), null, 'dd-heat-cell'));
    if (candMap.has(r.pereche)) tr.classList.add('dd-heat-cand');
    tbody.append(tr);
  });
  table.append(thead, tbody);
  el.replaceChildren(table);
});

// Definițiile seturilor de ponderi
dash.draw('profilBody', (tb) => {
  const d = Dx.ready(tb, 'profiluri');
  if (!d) return;
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  tb.replaceChildren(...d[0].map((p) => {
    const tr = document.createElement('tr');
    tr.dataset.key = p.id;
    const sum = p.uscator + p.cost + p.masina + p.fiabilitate + p.logistica + p.zgomot;
    const pct = (v) => Dx.fmt('n0', v / sum * 100) + '%';
    [[p.nume, ''], [pct(p.uscator), 'num'], [pct(p.cost), 'num'], [pct(p.masina), 'num'], [pct(p.fiabilitate), 'num'], [pct(p.logistica), 'num'], [pct(p.zgomot), 'num']].forEach(([txt, cls], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      td.dataset.label = labels[i] || '';
      tr.append(td);
    });
    return tr;
  }));
});

// Barele cu calitatea surselor, pe grupuri
dash.draw('surseBars', (el) => {
  const d = Dx.ready(el, 'calitateSurse');
  if (!d) return;
  const rows = d[0].filter((r) => r.grup === el.dataset.grup).sort((a, b) => b.n - a.n);
  const max = d3.max(rows, (r) => r.n) || 1;
  el.replaceChildren(...rows.map((r) => {
    const row = document.createElement('div'); row.className = 'dd-wrow';
    const lab = document.createElement('span'); lab.className = 'dd-wlab'; lab.textContent = r.eticheta;
    lab.dataset.source = 'calitateSurse'; lab.dataset.field = 'eticheta'; lab.dataset.where = 'id=' + r.id;
    const track = document.createElement('span'); track.className = 'dd-wtrack';
    const bar = document.createElement('span'); bar.className = 'dd-wbar';
    bar.style.width = (r.n / max * 100) + '%';
    bar.style.background = /slab|singur|general/.test(r.eticheta) ? 'var(--cds-chart-muted)' : dash.colors[0];
    track.append(bar);
    const val = document.createElement('span'); val.className = 'dd-wval'; val.textContent = Dx.fmt('n0', r.n);
    val.dataset.source = 'calitateSurse'; val.dataset.field = 'n'; val.dataset.where = 'id=' + r.id;
    row.append(lab, track, val);
    return row;
  }));
});
