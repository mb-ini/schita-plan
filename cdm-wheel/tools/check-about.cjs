#!/usr/bin/env node
/* Drift check for the "About this page" tabs of cdm-wheel/ and cdm-wheel/full/.

   About must describe the page as it is. Three things keep it honest:
   1. Facts that live in the page's data (counts, standards, link strengths, coverage) are
      filled in by assets/about.js at load time, so they cannot drift; this check fails if
      any of them could not be filled ("?") or if the data uses a link strength About does
      not explain.
   2. Everything else in About is prose. Each page carries an "about-manifest" with the
      sha256 of every file the prose was last reviewed against. If one of those files
      changes, this check fails until someone re-reads About, fixes it, and runs
      `node tools/check-about.cjs --update` to record the new hashes.
   3. The manifest lists every control the prose names ("Wheel", "Blocks", an asset class,
      the Playground...). Each must exist on the rendered page.

   Usage:  node tools/check-about.cjs            check both pages, exit 1 on any failure
           node tools/check-about.cjs --update   after reviewing About, record new hashes
   Needs:  playwright with Chromium (npm i playwright && npx playwright install chromium). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['.', 'full'];
const DESCRIBED = ['data/model.js', 'assets/app.js', 'assets/styles.css'];
const update = process.argv.includes('--update');
let failures = 0;
const fail = (page, msg) => { failures++; console.log(`FAIL [${page}] ${msg}`); };
const ok = (page, msg) => console.log(`ok   [${page}] ${msg}`);

const MANIFEST_RE = /(<script type="application\/json" id="about-manifest">)([\s\S]*?)(<\/script>)/;
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function readManifest(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const m = MANIFEST_RE.exec(html);
  if (!m) return { html, manifest: null };
  return { html, manifest: JSON.parse(m[2]) };
}

function writeManifest(dir, html, manifest) {
  const body = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(dir, 'index.html'), html.replace(MANIFEST_RE, (_, a, __, c) => a + body + c));
}

(async () => {
  const browser = await chromium.launch();
  for (const page of PAGES) {
    const dir = path.join(ROOT, page);
    const { html, manifest } = readManifest(dir);
    if (!manifest) { fail(page, 'index.html has no about-manifest'); continue; }

    // 2. the files the prose describes
    const now = {};
    for (const f of DESCRIBED) now[f] = sha(path.join(dir, f));
    if (update) {
      manifest.describes = now;
      manifest.reviewed = new Date().toISOString().slice(0, 10);
      writeManifest(dir, html, manifest);
      ok(page, `recorded hashes of ${DESCRIBED.join(', ')} (reviewed ${manifest.reviewed})`);
    } else {
      for (const f of DESCRIBED) {
        if (manifest.describes[f] !== now[f]) {
          fail(page, `${f} changed since About was last reviewed (${manifest.reviewed}). ` +
            'Re-read About against the page, fix it, then run with --update.');
        }
      }
      if (Object.keys(manifest.describes).length) ok(page, 'described files unchanged since review');
    }

    // 1 and 3, on the rendered page
    const url = 'file://' + path.join(dir, 'index.html');
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const tag = `${vp.width}px`;
      const pg = await browser.newPage({ viewport: vp });
      const errors = [];
      const external = [];
      pg.on('pageerror', (e) => errors.push(e.message));
      pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      pg.on('request', (r) => { if (!r.url().startsWith('file:')) external.push(r.url()); });
      await pg.goto(url);
      await pg.waitForTimeout(700);

      if (errors.length) fail(page, `${tag}: page errors: ${errors.join(' | ')}`);
      if (external.length) fail(page, `${tag}: external requests: ${external.join(', ')}`);
      if (!(await pg.isVisible('#about'))) fail(page, `${tag}: About is not shown on a plain link`);
      if (!(await pg.isVisible('#aboutbtn'))) fail(page, `${tag}: the About button is not visible`);
      const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) fail(page, `${tag}: page scrolls sideways by ${overflow}px`);

      if (vp.width === 1280) {
        const missing = await pg.$$eval('#about .missing', (els) => els.map((e) => e.textContent.trim()));
        if (missing.length) fail(page, `About could not fill or explain: ${missing.join(' | ')}`);
        else ok(page, 'every data-bound fact filled, every link strength explained');

        for (const m of manifest.mentions || []) {
          const found = await pg.$$eval(m.selector, (els, t) => els.some((e) => e.textContent.includes(t)), m.text);
          if (!found) fail(page, `About names "${m.text}" but nothing matching ${m.selector} contains it`);
        }
        if ((manifest.mentions || []).length) ok(page, `${manifest.mentions.length} named controls checked`);

        const gos = await pg.$$eval('#about [data-go]', (els) => [...new Set(els.map((e) => e.getAttribute('data-go')))]);
        for (const v of gos) {
          const label = v.charAt(0).toUpperCase() + v.slice(1);
          const has = await pg.$$eval('#views button', (els, l) => els.some((e) => e.textContent === l), label);
          if (!has) { fail(page, `About links to view "${v}", which the page does not have`); continue; }
          await pg.click(`#about [data-go="${v}"] >> nth=0`);
          await pg.waitForTimeout(250);
          const shown = await pg.evaluate((id) => { const e = document.getElementById(id + 'view'); return !!e && !e.hidden; }, v);
          if (!shown || (await pg.isVisible('#about'))) fail(page, `About's "${v}" button does not open that view`);
          await pg.click('#aboutbtn');
          await pg.waitForTimeout(150);
        }
        if (gos.length) ok(page, `About buttons open ${gos.join(', ')}`);
      }
      await pg.close();
    }
  }
  await browser.close();
  console.log(failures ? `\n${failures} failure(s)` : '\nAbout matches the pages.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
