// Barele cu numărul de constatări din research-ul din 26.11
dash.draw('resBars', (el) => {
  const d = Dx.ready(el, 'researchStats');
  if (!d) return;
  const rows = d[0].filter((r) => r.grup === el.dataset.grup);
  const max = d3.max(rows, (r) => r.n) || 1;
  el.replaceChildren(...rows.map((r) => {
    const row = document.createElement('div'); row.className = 'dd-wrow';
    const lab = document.createElement('span'); lab.className = 'dd-wlab'; lab.textContent = r.eticheta;
    lab.dataset.source = 'researchStats'; lab.dataset.field = 'eticheta'; lab.dataset.where = 'id=' + r.id;
    const track = document.createElement('span'); track.className = 'dd-wtrack';
    const bar = document.createElement('span'); bar.className = 'dd-wbar';
    bar.style.width = (r.n / max * 100) + '%';
    bar.style.background = dash.colors[el.dataset.grup === 'unghi' ? 0 : 2];
    track.append(bar);
    const val = document.createElement('span'); val.className = 'dd-wval'; val.textContent = Dx.fmt('n0', r.n);
    val.dataset.source = 'researchStats'; val.dataset.field = 'n'; val.dataset.where = 'id=' + r.id;
    row.append(lab, track, val);
    return row;
  }));
});

// Rezumatul fiecărui unghi
dash.draw('rezCards', (el) => {
  const d = Dx.ready(el, 'rezumate');
  if (!d) return;
  el.replaceChildren(...d[0].map((r, i) => {
    const c = document.createElement('div'); c.className = 'dd-card dd-brand';
    const h = document.createElement('h3'); h.textContent = r.unghi;
    h.dataset.source = 'rezumate'; h.dataset.field = 'unghi'; h.dataset.row = String(i);
    const p = document.createElement('p'); p.textContent = r.rezumat;
    p.dataset.source = 'rezumate'; p.dataset.field = 'rezumat'; p.dataset.row = String(i);
    c.append(h, p);
    return c;
  }));
});

// Filtrele tabelului
const ddResSel = (key, field, allLabel) => (sel) => {
  const s = dash.data('research');
  const vals = s.status === 'ok' ? [...new Set(s.data.map((r) => r[field]).filter(Boolean))] : [];
  const cur = window[key] || '';
  sel.replaceChildren(new Option(allLabel, ''), ...vals.map((v) => new Option(v, v)));
  sel.value = vals.includes(cur) ? cur : '';
  sel.onchange = () => { window[key] = sel.value; dash.draw('resBody'); dash.draw('resCount'); };
};
dash.draw('resUnghiSel', ddResSel('ddResU', 'unghi', 'Toate unghiurile'));
dash.draw('resMarcaSel', ddResSel('ddResM', 'marca', 'Toate mărcile'));

// Tabelul cu toate constatările din 26.11
dash.draw('resBody', (tb) => {
  const d = Dx.ready(tb, 'research');
  if (!d) return;
  const u = window.ddResU || '';
  const m = window.ddResM || '';
  const sEl = document.querySelector('#dd-res-semnal');
  const s = sEl ? sEl.value : '';
  const rank = (r) => (r.verificare === 'confirmat' ? 0 : /în parte/.test(r.verificare) ? 1 : 2) * 10 + ({'modelul exact': 0, 'model înrudit': 1, 'model mai vechi': 2}[r.apropiere] ?? 3);
  const all = d[0].filter((r) => (!u || r.unghi === u) && (!m || r.marca === m) && (!s || r.semnal === s)).sort((a, b) => rank(a) - rank(b));
  const list = window.ddResAll ? all : all.slice(0, 25);
  const labels = [...tb.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const cols = ['unghi', 'marca', 'model', 'apropiere', 'constatare', 'semnal', 'tipSursa', 'verificare', 'site'];
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.id;
    cols.forEach((c, i) => {
      const td = document.createElement('td');
      td.dataset.label = labels[i] || '';
      if (c === 'site' && /^https?:\/\//.test(r.url)) {
        const a = document.createElement('a');
        a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.site || 'sursa';
        td.append(a);
      } else td.textContent = r[c] || '—';
      if (c === 'semnal') td.className = r.semnal === 'favorabil' ? 'dd-good' : r.semnal === 'nefavorabil' ? 'dd-bad' : 'dd-muted';
      if (c === 'constatare') td.className = 'dd-wide';
      if (c === 'verificare' && r.verificare !== 'neverificat separat') td.classList.add('dd-strongtxt');
      tr.append(td);
    });
    return tr;
  }));
});

// Câte rânduri se văd
dash.draw('resCount', (el) => {
  const d = Dx.ready(el, 'research');
  if (!d) return;
  const u = window.ddResU || '';
  const m = window.ddResM || '';
  const sEl = document.querySelector('#dd-res-semnal');
  const s = sEl ? sEl.value : '';
  const total = d[0].filter((r) => (!u || r.unghi === u) && (!m || r.marca === m) && (!s || r.semnal === s)).length;
  const shown = window.ddResAll ? total : Math.min(25, total);
  el.textContent = shown === total ? `Se văd toate cele ${total} constatări.` : `Se văd primele ${shown} din ${total} constatări, întâi cele verificate și cele despre modelele noastre.`;
});

document.querySelectorAll('#dd-res-semnal').forEach((s) => s.addEventListener('change', () => { dash.draw('resBody'); dash.draw('resCount'); }));
document.querySelectorAll('#dd-res-all, #dd-res-less').forEach((b) => b.addEventListener('click', () => {
  window.ddResAll = b.id === 'dd-res-all';
  document.querySelectorAll('#dd-res-all').forEach((x) => { x.hidden = window.ddResAll; });
  document.querySelectorAll('#dd-res-less').forEach((x) => { x.hidden = !window.ddResAll; });
  dash.draw('resBody');
  dash.draw('resCount');
}));
