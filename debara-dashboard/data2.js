dash.loader('findingLinks', {
  description: 'Din celulele coloanei «Link» a constatărilor ia adresa fiecărui link și eticheta lui; «rand» e numărul rândului din foaie.',
  fn: ({answer}) => {
    const a = answer && answer.sheets ? answer : (answer && answer.content) || answer;
    const block = a && a.sheets && a.sheets[0] && a.sheets[0].data && a.sheets[0].data[0];
    if (!block) throw new Error('Foaia nu a trimis celulele cu linkuri.');
    const start = block.startRow || 0;
    const rows = [];
    (block.rowData || []).forEach((r, i) => {
      const c = r && r.values && r.values[0];
      if (!c) return;
      rows.push({rand: String(start + 1 + i), eticheta: String(c.formattedValue || ''), url: String(c.hyperlink || '')});
    });
    return {columns: ['rand', 'eticheta', 'url'], rows};
  }
});

dash.calc('dovezi', {
  title: 'Constatările, cu linkul la sursă',
  description: 'Constatările din turul pe mărci, fără rândurile de rezumat, cu adresa sursei și cât de aproape e modelul discutat de al nostru.',
  inputs: ['findings', 'findingLinks'],
  fn: (findings, links) => {
    const apropiere = (m) => {
      const t = String(m || '').toLowerCase();
      if (t.includes('exact')) return 'modelul exact';
      if (t.includes('frate') || t.includes('aceeași platformă')) return 'model înrudit';
      if (t.includes('mai vechi')) return 'model mai vechi';
      return 'marcă, în general';
    };
    return findings.filter((f) => f.marca && !/^Rezumat/.test(f.tipSursa)).map((f) => {
      const l = links.find((x) => x.rand === f.rand);
      return {rand: f.rand, marca: f.marca, data: f.data, aparat: f.aparat, tipSursa: f.tipSursa, sursa: f.sursa, model: f.model, apropiere: apropiere(f.model), constatare: f.constatare, persoane: f.persoane, categorie: f.categorie, semnal: f.semnal, eticheta: l ? l.eticheta : f.link, url: l ? l.url : ''};
    });
  }
});

dash.calc('calitateSurse', {
  title: 'Din ce fel de surse vin constatările',
  description: 'Numărul de constatări pe tip de sursă, pe cât de aproape e modelul de al nostru și pe câți oameni le susțin.',
  inputs: ['dovezi'],
  fn: (dovezi) => {
    const out = [];
    const add = (grup, id, eticheta, n) => out.push({grup, id, eticheta, n});
    add('total', 'total', 'constatări', dovezi.length);
    add('total', 'site-uri', 'site-uri diferite', new Set(dovezi.map((d) => { const m = String(d.url).match(/^https?:\/\/([^/]+)/); return m ? m[1] : d.eticheta; })).size);
    const tipuri = [...new Set(dovezi.map((d) => d.tipSursa))];
    tipuri.forEach((t) => add('tip', 'tip-' + tipuri.indexOf(t), t, dovezi.filter((d) => d.tipSursa === t).length));
    ['modelul exact', 'model înrudit', 'model mai vechi', 'marcă, în general'].forEach((a, i) => add('apropiere', 'apr-' + i, a, dovezi.filter((d) => d.apropiere === a).length));
    const unu = (p) => /^1( |$)/.test(String(p).trim()) && !/[+/]/.test(String(p));
    const mai = (p) => /^(\d+\+?|\d+ \+ \d+.*|\d+ \/ \d+)$/.test(String(p).trim()) && !unu(p);
    add('oameni', 'om-1', 'un singur caz', dovezi.filter((d) => unu(d.persoane)).length);
    add('oameni', 'om-n', 'mai mulți oameni', dovezi.filter((d) => mai(d.persoane)).length);
    add('oameni', 'om-0', 'nu se poate număra (teste, service, pagini oficiale)', dovezi.filter((d) => !unu(d.persoane) && !mai(d.persoane)).length);
    return out;
  }
});

dash.calc('profiluri', {
  title: 'Seturi de ponderi pentru alte unghiuri',
  description: 'Primul set e cel din foaie; celelalte sunt alese de Claude ca să arate cum se schimbă clasamentul când contează altceva.',
  inputs: ['weights'],
  fn: (weights) => {
    const w = Object.fromEntries(weights.map((r) => [r.criteriu, r.pondere]));
    return [
      {id: 'actual', nume: 'Ponderile tale de acum', uscator: w['Uscător'], cost: w['Cost'], masina: w['Mașină'], fiabilitate: w['Fiabilitate'], logistica: w['Logistică'], zgomot: w['Zgomot + vapori']},
      {id: 'top2', nume: 'Ca în Topul 2, fără fiabilitate', uscator: 40, cost: 25, masina: 20, fiabilitate: 0, logistica: 10, zgomot: 5},
      {id: 'bani', nume: 'Contează mai ales banii', uscator: 15, cost: 50, masina: 10, fiabilitate: 15, logistica: 5, zgomot: 5},
      {id: 'fiabil', nume: 'Să nu se strice', uscator: 20, cost: 15, masina: 10, fiabilitate: 45, logistica: 10, zgomot: 0},
      {id: 'haine', nume: 'Grija pentru haine', uscator: 55, cost: 15, masina: 10, fiabilitate: 15, logistica: 5, zgomot: 0},
      {id: 'liniste', nume: 'Liniște în casă', uscator: 25, cost: 15, masina: 10, fiabilitate: 20, logistica: 5, zgomot: 25},
      {id: 'egal', nume: 'Toate criteriile cam la fel', uscator: 17, cost: 17, masina: 17, fiabilitate: 17, logistica: 16, zgomot: 16}
    ];
  }
});

dash.calc('scoruriProfil', {
  title: 'Scorul și locul fiecărei perechi, pe fiecare set de ponderi',
  description: 'Scorul se refă din notele din foaie cu fiecare set de ponderi; apoi se numără în câte seturi perechea iese în primele cinci.',
  inputs: ['combos', 'profiluri'],
  fn: (combos, profiluri) => {
    const rows = combos.map((c) => ({pereche: c.pereche, aceeasiMarca: c.aceeasiMarca, locFoaie: c.loc}));
    profiluri.forEach((p) => {
      const sum = p.uscator + p.cost + p.masina + p.fiabilitate + p.logistica + p.zgomot;
      combos.forEach((c, i) => {
        const s = (p.uscator * c.notaUscator + p.cost * c.scorCost + p.masina * c.notaMasina + p.fiabilitate * c.fiabilitate + p.logistica * c.logistica + p.zgomot * c.scorZgomotVapori) / sum;
        rows[i]['scor_' + p.id] = Math.round(s * 100) / 100;
      });
      const order = rows.map((r, i) => i).sort((a, b) => rows[b]['scor_' + p.id] - rows[a]['scor_' + p.id]);
      order.forEach((idx, k) => { rows[idx]['loc_' + p.id] = k + 1; });
    });
    rows.forEach((r) => {
      const locs = profiluri.map((p) => r['loc_' + p.id]);
      r.inTop5 = locs.filter((l) => l <= 5).length;
      r.celMaiBunLoc = Math.min(...locs);
      r.celMaiSlabLoc = Math.max(...locs);
      r.locMediu = Math.round(locs.reduce((a, b) => a + b, 0) / locs.length * 10) / 10;
    });
    return rows;
  }
});

dash.calc('contributii', {
  title: 'Din ce e făcut scorul variantelor A, B și C',
  description: 'Fiecare notă din foaie înmulțită cu ponderea ei; suma lor e scorul total.',
  inputs: ['combos', 'weights'],
  fn: (combos, weights) => {
    const w = Object.fromEntries(weights.map((r) => [r.criteriu, (r.pondere || 0) / 100]));
    const pick = [
      {id: 'samsung', eticheta: 'A · Samsung', uscator: 'DV90DG6845LKU4', masina: 'WW90CGC04DAHLE'},
      {id: 'bosch-s6-nou', eticheta: 'B · Bosch cu WQN246D1BY', uscator: 'WQN246D1BY', masina: 'WGG244Z5BY'},
      {id: 'bosch-s8', eticheta: 'C · Bosch cu Serie 8', uscator: 'WQB246CNBY', masina: 'WGG244Z5BY'}
    ];
    const rows = pick.map((p) => {
      const c = combos.find((r) => r.uscator === p.uscator && r.masina === p.masina);
      if (!c) return null;
      const r = {
        id: p.id, eticheta: p.eticheta,
        uscator: c.notaUscator * w['Uscător'], cost: c.scorCost * w['Cost'], masina: c.notaMasina * w['Mașină'],
        fiabilitate: c.fiabilitate * w['Fiabilitate'], logistica: c.logistica * w['Logistică'], zgomot: c.scorZgomotVapori * w['Zgomot + vapori']
      };
      ['uscator', 'cost', 'masina', 'fiabilitate', 'logistica', 'zgomot'].forEach((k) => { r[k] = Math.round(r[k] * 100) / 100; });
      r.total = Math.round((r.uscator + r.cost + r.masina + r.fiabilitate + r.logistica + r.zgomot) * 100) / 100;
      return r;
    }).filter(Boolean);
    const a = rows.find((r) => r.id === 'samsung');
    const b = rows.find((r) => r.id === 'bosch-s6-nou');
    if (a && b) {
      rows.push({id: 'dif-a-b', eticheta: 'A minus B', uscator: Math.round((a.uscator - b.uscator) * 100) / 100, cost: Math.round((a.cost - b.cost) * 100) / 100, masina: Math.round((a.masina - b.masina) * 100) / 100, fiabilitate: Math.round((a.fiabilitate - b.fiabilitate) * 100) / 100, logistica: Math.round((a.logistica - b.logistica) * 100) / 100, zgomot: Math.round((a.zgomot - b.zgomot) * 100) / 100, total: Math.round((a.total - b.total) * 100) / 100});
    }
    return rows;
  }
});

dash.calc('dacaIncredere', {
  title: 'Ce se schimbă dacă datele despre uscătoare ar fi la fel de sigure',
  description: 'Nota unui uscător e înmulțită în foaie cu încrederea în date (0,75 când testul e pe alt model al mărcii). Aici nota e refăcută ca și cum testul ar fi pe modelul exact, iar clasamentul se refă.',
  inputs: ['combos', 'dryers', 'weights'],
  fn: (combos, dryers, weights) => {
    const wU = ((weights.find((r) => r.criteriu === 'Uscător') || {}).pondere || 0) / 100;
    const rows = combos.map((c) => {
      const d = dryers.find((x) => x.model === c.uscator);
      const inc = d && d.incredere ? d.incredere : 1;
      const notaNoua = inc > 0 && inc < 1 ? c.notaUscator / inc : c.notaUscator;
      return {pereche: c.pereche, uscator: c.uscator, masina: c.masina, scor: c.scor, loc: c.loc, incredere: inc, scorNou: Math.round((c.scor + wU * (notaNoua - c.notaUscator)) * 100) / 100};
    });
    rows.slice().sort((a, b) => b.scorNou - a.scorNou).forEach((r, k) => { r.locNou = k + 1; });
    const pick = {'DV90DG6845LKU4|WW90CGC04DAHLE': 'samsung', 'WQN246D1BY|WGG244Z5BY': 'bosch-s6-nou', 'WQB246CNBY|WGG244Z5BY': 'bosch-s8'};
    return rows.filter((r) => pick[r.uscator + '|' + r.masina]).map((r) => ({id: pick[r.uscator + '|' + r.masina], pereche: r.pereche, incredere: r.incredere, scor: r.scor, loc: r.loc, scorNou: r.scorNou, locNou: r.locNou}));
  }
});

dash.calc('frontiera', {
  title: 'Perechile de pe frontiera cost–scor',
  description: 'Perechile pentru care nu există alta care să fie și mai ieftină pe 12 ani, și cu scor mai mare.',
  inputs: ['combos'],
  fn: (combos) => {
    const s = combos.filter((c) => c.cost12 != null && c.scor != null).slice().sort((a, b) => a.cost12 - b.cost12 || b.scor - a.scor);
    const out = [];
    let best = -Infinity;
    s.forEach((c) => { if (c.scor > best) { out.push({pereche: c.pereche, cost12: c.cost12, scor: c.scor, loc: c.loc, aceeasiMarca: c.aceeasiMarca}); best = c.scor; } });
    return out;
  }
});

dash.calc('peAparat', {
  title: 'Uscătoarele și mașinile, după scorul mediu în pereche',
  description: 'Pentru fiecare aparat, media și maximul scorului din toate perechile în care apare.',
  inputs: ['combos'],
  fn: (combos) => {
    const out = [];
    const grup = (tip, key, re) => {
      const m = new Map();
      combos.forEach((c) => {
        const k = c[key];
        if (!m.has(k)) m.set(k, {tip, model: k, nume: '', scoruri: [], bestScor: -1, bestPereche: ''});
        const g = m.get(k);
        const mm = String(c.pereche).match(re);
        if (mm) g.nume = mm[1];
        g.scoruri.push(c.scor);
        if (c.scor > g.bestScor) { g.bestScor = c.scor; g.bestPereche = c.pereche; }
      });
      [...m.values()].forEach((g) => out.push({tip: g.tip, id: g.tip + '-' + g.model, model: g.model, nume: g.nume, scorMediu: Math.round(g.scoruri.reduce((a, b) => a + b, 0) / g.scoruri.length * 100) / 100, scorMaxim: g.bestScor, perecheMaxima: g.bestPereche}));
    };
    grup('uscător', 'uscator', /^usc\. (.+?) \+ maș\./);
    grup('mașină', 'masina', /\+ maș\. (.+)$/);
    ['uscător', 'mașină'].forEach((t) => {
      const v = out.filter((r) => r.tip === t).map((r) => r.scorMediu);
      out.push({tip: 'amplitudine', id: 'amplitudine-' + (t === 'uscător' ? 'uscator' : 'masina'), model: '', nume: t, scorMediu: Math.round((Math.max(...v) - Math.min(...v)) * 100) / 100, scorMaxim: null, perecheMaxima: ''});
    });
    return out;
  }
});
