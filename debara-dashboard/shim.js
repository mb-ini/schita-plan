// Pagină statică: datele sunt copiate în snapshot.js, iar acest fișier oferă
// aceleași funcții (dash.data, dash.calc, dash.loader, dash.draw) ca dashboard-ul original.
(() => {
  const S = window.DD_SNAPSHOT || {};
  const loaders = {};
  const calcs = {};
  const draws = {};
  const cache = {};

  function get(id) {
    if (cache[id]) return cache[id];
    let res;
    try {
      if (calcs[id]) {
        const inputs = calcs[id].inputs.map((i) => {
          const r = get(i);
          if (r.status !== 'ok') throw new Error('lipsește ' + i);
          return r.data;
        });
        res = {status: 'ok', data: calcs[id].fn(...inputs)};
      } else if (Object.prototype.hasOwnProperty.call(S, id)) {
        const answer = S[id];
        if (loaders[id]) {
          const out = loaders[id].fn({answer, items: [answer], args: {}, call: null, read: {}});
          const rows = Array.isArray(out) ? out : (out.rows || out.data || []);
          res = {status: 'ok', data: rows, columns: out.columns};
        } else {
          res = {status: 'ok', data: answer};
        }
      } else {
        res = {status: 'missing', data: []};
      }
    } catch (e) {
      console.error(id, e);
      res = {status: 'error', data: [], message: String((e && e.message) || e)};
    }
    cache[id] = res;
    return res;
  }

  function runDraw(name) {
    const fn = draws[name];
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      try { fn(el); } catch (e) { console.error(name, e); }
    });
  }

  function runAll() { Object.keys(draws).forEach(runDraw); }

  window.dash = {
    loader: (id, o) => { loaders[id] = o; },
    calc: (id, o) => { calcs[id] = o; },
    data: (id) => get(id),
    draw: (name, fn) => {
      if (typeof fn === 'function') draws[name] = fn;
      else if (fn && typeof fn === 'object') {
        const made = new WeakMap();
        draws[name] = (el) => {
          if (!made.has(el)) { el.replaceChildren(); made.set(el, fn.mount ? fn.mount(el) : undefined); }
          if (fn.update) fn.update(el, made.get(el));
        };
      } else runDraw(name);
    },
    colors: ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'],
    onData: (fn) => fn(),
    params: () => ({}),
    setParams: () => {},
    resetParams: () => {},
    setLink: () => {},
    refresh: () => {},
    __runAll: runAll
  };

  let lastW = window.innerWidth;
  let timer = null;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(runAll, 150);
  });
})();
