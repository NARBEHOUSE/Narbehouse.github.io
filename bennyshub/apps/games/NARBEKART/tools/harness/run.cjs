/**
 * NARBE Racer — Electron test harness.
 *
 * Runs a scenario script against a real Electron 40 window, the same engine
 * the hub ships with, and writes screenshots + a results.json.
 *
 * Usage (from anywhere; paths are resolved relative to this file):
 *   env -u ELECTRON_RUN_AS_NODE <hub>/node_modules/electron/dist/electron.exe \
 *       tools/harness/run.cjs <scenario.cjs> [--show] [--w 1600] [--h 900] [--out DIR]
 *
 * ELECTRON_RUN_AS_NODE is set in this machine's shell and MUST be unset, or
 * require('electron') returns a path string and nothing works.
 *
 * What it does for you:
 *   - serves bennyshub/ over http on a random free port with no-store caching,
 *     so ../../../shared/*.js resolve exactly as they do inside the hub and a
 *     rebuilt file is never served stale;
 *   - uses a fresh temporary profile per run (parallel runs never collide, and
 *     localStorage starts empty);
 *   - stubs speech so tests are silent, and records every spoken line;
 *   - mutes page audio;
 *   - collects console warnings/errors and page crashes;
 *   - offscreen by default (rAF keeps running at 60 fps); pass --show for a real
 *     window when measuring FPS.
 *
 * A scenario is a CommonJS module exporting `async function (t) { ... }`. The
 * helper object `t` is documented at the bottom of this file.
 */
'use strict';

// A GUI Electron launch can outlive the terminal that owns its log pipe.
// A closed output pipe must never open an unhandled-error dialog over the game.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => { if (error.code !== 'EPIPE') throw error; });
}
const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ── Arguments ────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2).filter((a) => !a.startsWith('--inspect'));
function flag(name) { return argv.includes('--' + name); }
function opt(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
}
// Electron passes its own script path through argv on some launches; the
// scenario is the first argument ending in .cjs/.js that is not this file.
const scenarioArg = argv.find((a) => /\.(c?js)$/i.test(a) && path.resolve(a) !== __filename);
if (!scenarioArg) {
  console.error('usage: electron run.cjs <scenario.cjs> [--show] [--w N] [--h N] [--out DIR]');
  process.exit(2);
}
const scenarioPath = path.resolve(process.cwd(), scenarioArg);
const SHOW = flag('show');
const W = parseInt(opt('w', '1600'), 10);
const H = parseInt(opt('h', '900'), 10);
const scenarioName = path.basename(scenarioPath).replace(/\.(c?js)$/i, '');
const outDir = path.resolve(opt('out', path.join(os.tmpdir(), 'nk-harness',
  scenarioName + '-' + new Date().toISOString().replace(/[:.]/g, '-'))));
fs.mkdirSync(outDir, { recursive: true });

// bennyshub/ is five levels up: harness → tools → NARBEKART → games → apps → bennyshub
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

/* Profile isolation: must happen before 'ready'. */
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'nk-profile-')));
app.on('window-all-closed', () => { /* keep running; the scenario decides */ });

/* ── Static server ────────────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain'
};

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://x');
        let p = decodeURIComponent(u.pathname);
        let file = path.normalize(path.join(ROOT, p));
        if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 ' + p); return; }
        const body = fs.readFileSync(file);
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(body);
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ── Page preload: silent, recorded speech ────────────────────────────── */
const PRELOAD = path.join(os.tmpdir(), 'nk-harness-preload.js');
fs.writeFileSync(PRELOAD, `
  window.__spoken = [];
  try {
    const ss = window.speechSynthesis;
    if (ss) {
      ss.speak = function (u) { try { window.__spoken.push({ t: performance.now(), text: String(u && u.text) }); } catch (e) {} };
      ss.cancel = function () {};
    }
  } catch (e) {}
`);

/* ── Runner ───────────────────────────────────────────────────────────── */
const results = { scenario: scenarioName, outDir, checks: [], errors: [], warnings: [], notes: [], shots: [] };
let win = null, server = null, base = '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function js(code) {
  try {
    return await win.webContents.executeJavaScript(code, true);
  } catch (e) {
    throw new Error('js failed: ' + String(e && e.message || e) + '\n  in: ' + code.slice(0, 240));
  }
}

let warmedUp = false;
async function shot(name) {
  await wait(120);
  if (!warmedUp) {
    // The first capture after a fresh load has thrown UnknownVizError here.
    try { await win.webContents.capturePage(); } catch (e) { /* warm-up */ }
    warmedUp = true;
    await wait(80);
  }
  let img;
  try { img = await win.webContents.capturePage(); }
  catch (e) { await wait(200); img = await win.webContents.capturePage(); }
  const file = path.join(outDir, name.replace(/[^\w.-]+/g, '_') + '.png');
  fs.writeFileSync(file, img.toPNG());
  results.shots.push(file);
  return file;
}

const t = {
  /** Load a page by path relative to bennyshub/, e.g. 'apps/games/NARBEKART/index.html'. */
  async load(rel, query) {
    const q = query ? '?' + new URLSearchParams(query).toString() : '';
    warmedUp = false;
    await win.loadURL(base + rel.replace(/^\/+/, '') + q);
  },
  js,
  wait,
  shot,
  /** Poll a page expression until truthy. */
  async until(expr, timeout) {
    const at = Date.now(), lim = timeout || 20000;
    while (Date.now() - at < lim) {
      if (await js('(function(){try{return !!(' + expr + ')}catch(e){return false}})()')) return true;
      await wait(100);
    }
    throw new Error('Timeout waiting for: ' + expr);
  },
  /** Dispatch a KeyboardEvent on document: window capture listeners (scan-manager,
   *  NK.input) see it first, then document listeners — the same path a real key takes. */
  async key(type, code) {
    const key = code === 'Space' ? ' ' : (code === 'Enter' || code === 'NumpadEnter' ? 'Enter' : code);
    await js('document.dispatchEvent(new KeyboardEvent(' + JSON.stringify(type) + ',{code:' + JSON.stringify(code) +
      ',key:' + JSON.stringify(key) + ',bubbles:true,cancelable:true}));true');
  },
  /** Press and hold a switch for `ms`, then release. */
  async press(code, ms) {
    await t.key('keydown', code);
    await wait(ms === undefined ? 160 : ms);
    await t.key('keyup', code);
  },
  assert(ok, name, detail) {
    results.checks.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
    if (!ok) console.log('  ✗ ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 400) : ''));
    else console.log('  ✓ ' + name);
    return !!ok;
  },
  note(msg) { results.notes.push(msg); console.log('  · ' + msg); },
  /** Measure real frames for `ms` (use --show for trustworthy numbers). */
  async fps(ms) {
    return js('new Promise(r=>{let n=0;const t0=performance.now();(function f(t){n++;if(t-t0<' + (ms || 3000) +
      ')requestAnimationFrame(f);else r({fps:+(n*1000/(t-t0)).toFixed(1),perf:(window.NK&&NK.perf)?NK.perf():null})})(t0)})');
  },
  spoken() { return js('window.__spoken || []'); },
  setSize(w, h) { win.setContentSize(w, h); return wait(250); },
  get win() { return win; },
  get outDir() { return outDir; },
  get errors() { return results.errors; }
};

app.whenReady().then(async () => {
  let code = 0;
  try {
    server = await startServer();
    base = 'http://127.0.0.1:' + server.address().port + '/';
    await session.defaultSession.clearCache();
    // Block everything off-box so a stray CDN reference shows up as an error.
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      const u = d.url;
      const local = u.startsWith('http://127.0.0.1') || u.startsWith('data:') || u.startsWith('blob:') ||
                    u.startsWith('devtools:') || u.startsWith('chrome');
      if (!local) results.warnings.push('blocked external request: ' + u);
      cb({ cancel: !local });
    });

    win = new BrowserWindow({
      show: SHOW,
      width: W, height: H, useContentSize: true,
      backgroundColor: '#101820',
      webPreferences: {
        offscreen: !SHOW,
        backgroundThrottling: false,
        contextIsolation: false,
        nodeIntegration: false,
        preload: PRELOAD
      }
    });
    win.webContents.setAudioMuted(true);
    win.webContents.on('console-message', (e) => {
      const lvl = e && e.level, msg = e && e.message;
      if (lvl === 'error') results.errors.push(String(msg));
      else if (lvl === 'warning') {
        const m = String(msg);
        // Known, expected noise.
        if (/Electron Security Warning|build\/three(\.min)?\.js" are deprecated|useLegacyLights/.test(m)) return;
        results.warnings.push(m);
        if (/not loaded/.test(m)) results.errors.push('shared script failed: ' + m);
      }
    });
    win.webContents.on('render-process-gone', (_e, d) => results.errors.push('render-process-gone: ' + JSON.stringify(d)));
    win.webContents.on('preload-error', (_e, p, err) => results.errors.push('preload-error: ' + err));

    const scenario = require(scenarioPath);
    await scenario(t);
  } catch (e) {
    results.checks.push({ name: 'scenario completed', ok: false, detail: String(e && e.stack || e) });
    console.log('  ✗ scenario threw: ' + String(e && e.stack || e));
    try { await shot('failure'); } catch (e2) { /* ignore */ }
  } finally {
    const failed = results.checks.filter((c) => !c.ok).length;
    results.summary = { checks: results.checks.length, failed, errors: results.errors.length };
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
    console.log('OUT=' + outDir);
    console.log('SUMMARY ' + JSON.stringify(results.summary));
    if (results.errors.length) console.log('ERRORS:\n  ' + results.errors.slice(0, 20).join('\n  '));
    code = (failed || results.errors.length) ? 1 : 0;
    try { server && server.close(); } catch (e) { /* ignore */ }
    app.exit(code);
  }
});

/*
 * Scenario helper reference (`t`):
 *   await t.load('apps/games/NARBEKART/index.html', { debug: 1 })
 *   await t.until('window.NK && NK.ui && NK.ui.ready')   // poll a page expression
 *   await t.js('NK.debug.start({...}); true')            // run code in the page (returns JSON-able values)
 *   await t.shot('01-title')                             // PNG into the out dir (warm-up handled)
 *   await t.press('Enter', 200)                          // keydown, hold, keyup (dispatched on document)
 *   await t.key('keydown', 'Space')                      // single edge
 *   t.assert(cond, 'name', detail)                       // recorded in results.json; failures exit 1
 *   await t.fps(3000)                                    // { fps, perf: NK.perf() } — use --show
 *   await t.spoken()                                     // [{ t, text }] everything TTS was asked to say
 *   await t.setSize(1024, 768)
 *   t.note('free text')
 */
