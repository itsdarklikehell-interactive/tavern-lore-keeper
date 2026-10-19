// Dark mode + PWA tests for The Tavern Lore Keeper.
// Covers the theme toggle (system preference, manual override,
// persistence) and the PWA wiring (manifest, service worker, icons).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Build a DOM whose matchMedia reflects the given system preference.
function makeDom(systemDark, opts = {}) {
  const consoleErrors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = function (query) {
        const isDark = /prefers-color-scheme:\s*dark/.test(query);
        const matches = isDark ? systemDark : !systemDark;
        return {
          matches,
          media: query,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; }
        };
      };
      window.addEventListener('error', e => consoleErrors.push(String(e.message || e.error)));
      if (opts.storage) {
        Object.defineProperty(window, 'localStorage', {
          value: opts.storage,
          configurable: true
        });
      }
    },
  });
  return { dom, consoleErrors };
}

// A minimal in-memory localStorage.
function memStorage(initial) {
  const store = Object.assign({}, initial || {});
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    _store: store
  };
}

(async () => {
  console.log('— theme toggle present —');
  {
    const { dom } = makeDom(true);
    const { document } = dom.window;
    const btn = document.getElementById('themeToggle');
    ok(btn !== null, 'theme toggle button exists');
    ok(document.documentElement.getAttribute('data-theme') === 'dark',
       'dark system preference → dark tavern look');
    dom.window.close();
  }

  console.log('— light theme applies —');
  {
    const { dom } = makeDom(true, { storage: memStorage() });
    const { document } = dom.window;
    document.getElementById('themeToggle').click();
    await sleep(20);
    ok(document.documentElement.getAttribute('data-theme') === 'light', 'click switches to light');
    const meta = document.querySelector('meta[name="theme-color"]');
    ok(meta && meta.getAttribute('content') === '#EFE3C6', 'theme-color follows the theme');
    ok(document.getElementById('themeToggle').getAttribute('aria-pressed') === 'true', 'aria-pressed reflects state');
    dom.window.close();
  }

  console.log('— dark theme applies —');
  {
    const { dom } = makeDom(true, { storage: memStorage({ 'tavern-lore-keeper:theme': 'light' }) });
    const { document } = dom.window;
    await sleep(20);
    ok(document.documentElement.getAttribute('data-theme') === 'light', 'stored light theme is honoured on load');
    document.getElementById('themeToggle').click();
    await sleep(20);
    ok(document.documentElement.getAttribute('data-theme') === 'dark', 'clicking again returns to dark');
    dom.window.close();
  }

  console.log('— system preference is respected —');
  {
    const { dom } = makeDom(false, { storage: memStorage() });
    const { document } = dom.window;
    await sleep(20);
    ok(document.documentElement.getAttribute('data-theme') === 'light', 'light system preference → light theme');
    dom.window.close();
  }

  console.log('— blank storage falls back to the system preference —');
  {
    const { dom } = makeDom(false, { storage: memStorage({ 'tavern-lore-keeper:theme': '' }) });
    const { document } = dom.window;
    await sleep(20);
    ok(document.documentElement.getAttribute('data-theme') === 'light',
       'empty stored value is treated as "unset" → light theme');
    dom.window.close();
  }

  console.log('— preference is persisted —');
  {
    const storage = memStorage();
    const { dom } = makeDom(true, { storage });
    dom.window.document.getElementById('themeToggle').click();
    await sleep(20);
    ok(storage.getItem('tavern-lore-keeper:theme') === 'light', 'choice written to localStorage');
    dom.window.close();
  }

  console.log('— PWA wiring —');
  {
    ok(/<link[^>]+rel="manifest"[^>]+href="manifest\.json"/.test(html), 'manifest is linked');
    ok(/<meta[^>]+name="theme-color"/.test(html), 'theme-color meta present');

    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    ok(manifest.name && manifest.name.length > 0, 'manifest has a name');
    ok(manifest.display === 'standalone', 'manifest requests standalone display');
    ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest declares icons');
    ok(manifest.icons.some(i => i.sizes === '192x192'), 'manifest has a 192px icon');
    ok(manifest.icons.some(i => i.sizes === '512x512'), 'manifest has a 512px icon');

    // every icon the manifest points at must exist on disk
    const missing = manifest.icons
      .map(i => i.src)
      .filter(src => !fs.existsSync(path.join(ROOT, src.replace(/^\//, ''))));
    ok(missing.length === 0, 'all manifest icons exist on disk' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));

    // every file the service worker precaches must exist
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const precacheBlock = sw.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
    ok(precacheBlock !== null, 'service worker declares a precache list');
    if (precacheBlock) {
      const assets = precacheBlock[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
      const missingAssets = assets.filter(a => !fs.existsSync(path.join(ROOT, a.replace(/^\//, ''))));
      ok(missingAssets.length === 0, 'all precached assets exist on disk' + (missingAssets.length ? ' (missing: ' + missingAssets.join(', ') + ')' : ''));
    }
    ok(/addEventListener\('install'/.test(sw), 'service worker handles install');
    ok(/addEventListener\('fetch'/.test(sw), 'service worker handles fetch');
    ok(/navigator\.serviceWorker\.register/.test(html), 'service worker is registered from the page');
    ok(!/<script[^>]+src="pwa\.js"/.test(html), 'no external pwa.js dependency (bootstrap is inline)');
  }

  console.log('— zero console errors —');
  {
    const { dom, consoleErrors } = makeDom(true);
    await sleep(60);
    ok(consoleErrors.length === 0, 'no console errors: ' + (consoleErrors.length ? consoleErrors.join(' | ') : 'clean'));
    dom.window.close();
  }

  console.log('');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('TEST CRASH:', e);
  process.exit(2);
});
