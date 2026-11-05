# cdm-wheel

Public copy of two pages from the private project `canonical_datamodel`:

- `./` — the first version of the standards explorer (17 FX products, Wheel and Lanes),
  commit d6d36e9, 31 October 2026, 02:01.
- `full/` — the explorer at the end of that night (169 products, Wheel, Lanes, Blocks,
  Playground), commit 20a1146, 31 October 2026, 13:57.

`app.js`, `styles.css` and `data/model.js` of both are copied unchanged. Added here: the
"About this page" tab (`index.html`, `assets/about.css`, `assets/about.js`).

## Rule: About must match the page

Any change under `cdm-wheel/` must pass

    node cdm-wheel/tools/check-about.cjs

which also runs on every push (`.github/workflows/cdm-wheel-about.yml`). If you change a
page's data, script or styles, the check fails until you re-read its About, fix what no
longer holds, and record the review with `node cdm-wheel/tools/check-about.cjs --update`.
Do not run `--update` without that review: it is the record that someone did it.
