dash.loader('combos', {
  description: 'Celulele din foaie devin rânduri: primul rând e antetul, iar coloanele primesc nume scurte. Numerele scrise cu virgulă la mii devin numere.',
  fn: ({answer}) => {
    const a = answer && Array.isArray(answer.values) ? answer : (answer && answer.content) || answer;
    if (!a || !Array.isArray(a.values)) throw new Error('Foaia nu a trimis celule.');
    const keys = ['uscator', 'masina', 'aceeasiMarca', 'kit', 'pretKit', 'cumparare', 'curent12', 'cost12', 'geam', 'fataColoana', 'notaUscator', 'notaMasina', 'fiabilitate', 'logistica', 'zgomot', 'vapori', 'scorCost', 'scorZgomotVapori', 'scor', 'loc', 'pereche'];
    const numeric = ['pretKit', 'cumparare', 'curent12', 'cost12', 'fataColoana', 'notaUscator', 'notaMasina', 'fiabilitate', 'logistica', 'zgomot', 'vapori', 'scorCost', 'scorZgomotVapori', 'scor', 'loc'];
    const head = a.values[0] || [];
    if (head[0] !== 'Uscător' || head[20] !== 'Combinație') throw new Error('Tabelul cu toate combinațiile nu mai începe la rândul 78 al foii «Top 3: perechi noi».');
    const num = (s) => { const t = String(s ?? '').trim().replace(/,/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
    const rows = a.values.slice(1).filter((r) => r && r[0]).map((r) => Object.fromEntries(keys.map((k, i) => [k, numeric.includes(k) ? num(r[i]) : String(r[i] ?? '')])));
    return {columns: keys, rows};
  }
});

dash.loader('weights', {
  description: 'Rândul cu ponderi din foaie devine câte un rând pe criteriu, cu ponderea în procente.',
  fn: ({answer}) => {
    const a = answer && Array.isArray(answer.values) ? answer : (answer && answer.content) || answer;
    if (!a || !Array.isArray(a.values)) throw new Error('Foaia nu a trimis celule.');
    const r = a.values[0] || [];
    if (r[0] !== 'Ponderi →') throw new Error('Rândul cu ponderi nu mai e la rândul 2 al foii «Top 3: perechi noi».');
    const rows = [];
    for (let i = 1; i + 1 < r.length; i += 2) {
      const t = String(r[i + 1] ?? '').replace('%', '').replace(',', '.').trim();
      if (r[i]) rows.push({criteriu: String(r[i]), pondere: /^\d+(\.\d+)?$/.test(t) ? Number(t) : null});
    }
    return {columns: ['criteriu', 'pondere'], rows};
  }
});

dash.loader('dryers', {
  description: 'Tabelul cu uscătoare din foaie devine rânduri cu nume scurte de coloane; celulele cu cifre devin numere.',
  fn: ({answer}) => {
    const a = answer && Array.isArray(answer.values) ? answer : (answer && answer.content) || answer;
    if (!a || !Array.isArray(a.values)) throw new Error('Foaia nu a trimis celule.');
    const keys = ['model', 'marca', 'grup', 'pret', 'kwh', 'condensare', 'zgomot', 'adancimeUsa', 'geam', 'precizie', 'sifonare', 'lana', 'incredere', 'nota', 'dtest', 'ajustare', 'fiabilitate', 'logistica', 'kit', 'pretKit', 'motiv', 'cashback'];
    const numeric = ['pret', 'kwh', 'condensare', 'zgomot', 'adancimeUsa', 'precizie', 'sifonare', 'lana', 'incredere', 'nota', 'dtest', 'ajustare', 'fiabilitate', 'logistica', 'pretKit', 'cashback'];
    const head = a.values[0] || [];
    if (head[0] !== 'Model' || head[1] !== 'Marcă') throw new Error('Tabelul cu uscătoare nu mai începe la rândul 51 al foii «Top 3: perechi noi».');
    const num = (s) => { const t = String(s ?? '').trim().replace(/,/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
    const rows = a.values.slice(1).filter((r) => r && r[0]).map((r) => Object.fromEntries(keys.map((k, i) => [k, numeric.includes(k) ? num(r[i]) : String(r[i] ?? '')])));
    return {columns: keys, rows};
  }
});

dash.loader('dtest', {
  description: 'Tabelul dTest pe mărci devine rânduri; indicii devin numere, iar «nu apare» rămâne gol.',
  fn: ({answer}) => {
    const a = answer && Array.isArray(answer.values) ? answer : (answer && answer.content) || answer;
    if (!a || !Array.isArray(a.values)) throw new Error('Foaia nu a trimis celule.');
    const keys = ['marca', 'masFiab', 'masSatisf', 'masVibratii', 'masZgomot', 'masConstanta', 'uscFiab', 'uscSatisf', 'uscZgomot', 'uscDurata', 'uscDefecte'];
    const numeric = ['masFiab', 'masSatisf', 'masVibratii', 'masZgomot', 'masConstanta', 'uscFiab', 'uscSatisf', 'uscZgomot'];
    const head = a.values[0] || [];
    if (head[0] !== 'Marcă' || head[1] !== 'Mașini: fiabilitate') throw new Error('Tabelul dTest nu mai începe la rândul 6 al foii «Tur forumuri pe mărci».');
    const num = (s) => { const t = String(s ?? '').trim(); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
    const rows = a.values.slice(1).filter((r) => r && r[0]).map((r) => Object.fromEntries(keys.map((k, i) => [k, numeric.includes(k) ? num(r[i]) : String(r[i] ?? '')])));
    return {columns: keys, rows};
  }
});

dash.loader('findings', {
  description: 'Constatările din turul pe mărci devin rânduri; coloana «rand» e numărul rândului din foaie, ca fiecare constatare să poată fi găsită acolo.',
  fn: ({answer}) => {
    const a = answer && Array.isArray(answer.values) ? answer : (answer && answer.content) || answer;
    if (!a || !Array.isArray(a.values)) throw new Error('Foaia nu a trimis celule.');
    const keys = ['marca', 'aparat', 'tipSursa', 'sursa', 'data', 'model', 'constatare', 'persoane', 'categorie', 'semnal', 'link'];
    const head = a.values[0] || [];
    if (head[0] !== 'Marcă' || head[6] !== 'Ce s-a constatat') throw new Error('Tabelul cu constatări nu mai începe la rândul 23 al foii «Tur forumuri pe mărci».');
    const rows = [];
    a.values.slice(1).forEach((r, j) => {
      if (!r || !r[0]) return;
      const row = {rand: String(24 + j)};
      keys.forEach((k, i) => { row[k] = String(r[i] ?? ''); });
      rows.push(row);
    });
    return {columns: ['rand', ...keys], rows};
  }
});

dash.calc('candidati', {
  title: 'Cele trei perechi rămase în discuție',
  description: 'Perechea Samsung și cele două perechi Bosch, luate din toate combinațiile, cu diferențele de preț dintre ele.',
  inputs: ['combos'],
  fn: (combos) => {
    const pick = [
      {id: 'samsung', eticheta: 'A', uscator: 'DV90DG6845LKU4', masina: 'WW90CGC04DAHLE'},
      {id: 'bosch-s6-nou', eticheta: 'B', uscator: 'WQN246D1BY', masina: 'WGG244Z5BY'},
      {id: 'bosch-s8', eticheta: 'C', uscator: 'WQB246CNBY', masina: 'WGG244Z5BY'}
    ];
    const rows = pick.map((p) => {
      const c = combos.find((r) => r.uscator === p.uscator && r.masina === p.masina);
      return c ? {id: p.id, eticheta: p.eticheta, pereche: c.pereche, loc: c.loc, scor: c.scor, cumparare: c.cumparare, cost12: c.cost12, fiabilitate: c.fiabilitate, zgomot: c.zgomot, kit: c.kit, geam: c.geam} : null;
    }).filter(Boolean);
    const samsung = rows.find((r) => r.id === 'samsung');
    const s8 = rows.find((r) => r.id === 'bosch-s8');
    return rows.map((r) => {
      const dif = samsung && r.cumparare != null && samsung.cumparare != null ? r.cumparare - samsung.cumparare : null;
      return {
        ...r,
        pesteSamsungCumparare: dif,
        difSamsungAbs: dif == null ? null : Math.abs(dif),
        pesteSamsung12: samsung && r.cost12 != null && samsung.cost12 != null ? r.cost12 - samsung.cost12 : null,
        economieFataDeS8: s8 && r.cumparare != null && s8.cumparare != null ? s8.cumparare - r.cumparare : null
      };
    });
  }
});

dash.calc('semnale', {
  title: 'Constatări pe mărci, după semnal',
  description: 'Câte constatări favorabile, neutre și nefavorabile are fiecare marcă în turul din 25.11, fără rândurile de rezumat.',
  inputs: ['findings'],
  fn: (findings) => {
    const out = [];
    for (const f of findings) {
      if (!f.marca || /^Rezumat/.test(f.tipSursa)) continue;
      let r = out.find((o) => o.marca === f.marca);
      if (!r) { r = {marca: f.marca, favorabil: 0, neutru: 0, nefavorabil: 0, total: 0}; out.push(r); }
      if (['favorabil', 'neutru', 'nefavorabil'].includes(f.semnal)) r[f.semnal] += 1;
      r.total += 1;
    }
    return out;
  }
});
