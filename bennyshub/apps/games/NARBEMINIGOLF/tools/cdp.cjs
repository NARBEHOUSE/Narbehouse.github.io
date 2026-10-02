/* NARBE Mini Golf — drive the real game in headless Chrome over CDP.
 * No npm dependencies (Sphere Splash's check-browser pattern): serve bennyshub/
 * over HTTP, spawn Chrome, talk to it over the DevTools websocket.
 *
 *   const s = await require('./cdp.cjs').open({ width, height });
 *   await s.go('/apps/games/NARBEMINIGOLF/index.html');
 *   await s.evaluate('1+1'); await s.key('Space', 'down'); await s.shot(file);
 *   await s.close();
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../../../..');          // bennyshub/
const wait = ms => new Promise(r => setTimeout(r, ms));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };

function findChrome() {
  const list = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'];
  return list.find(p => p && fs.existsSync(p));
}

async function open(opts) {
  opts = opts || {};
  // Headless Chrome renders WebGL in software and pins the CPU; on the family
  // PC it froze the whole machine. Opt in deliberately, on a machine that can take it.
  if (!process.env.MG2_ALLOW_BROWSER) {
    throw Error('Browser tests are off by default because they can freeze this PC. Set MG2_ALLOW_BROWSER=1 to run them on a machine that can take it.');
  }
  const width = opts.width || 1368, height = opts.height || 840;
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mg2-chrome-'));
  const exe = findChrome();
  if (!exe) throw Error('No Chrome found; set CHROME=path');
  const args = ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=' + width + ',' + height,
    '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'];
  if (opts.gpu) args.splice(args.indexOf('--use-angle=swiftshader'), 1);
  const chrome = spawn(exe, args, { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await wait(100);
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  let targets = [];
  for (let i = 0; i < 50 && !targets.find(t => t.type === 'page'); i++) {
    try { targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch (e) { /* not up yet */ }
    if (!targets.find(t => t.type === 'page')) await wait(100);
  }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), errors = [], logs = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' ');
      if (msg.params.type === 'error') errors.push(text);
      logs.push(msg.params.type + ': ' + text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
    if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); if (p) (msg.error ? p.reject(Error(JSON.stringify(msg.error))) : p.resolve(msg.result)); }
  };
  const call = (method, params) => new Promise((res, rej) => { pending.set(++id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  await call('Runtime.enable'); await call('Log.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(expr.slice(0, 120) + ' :: ' + JSON.stringify((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  };
  const until = async (expr, timeout) => {
    timeout = timeout || 30000;
    for (let t = 0; t < timeout; t += 100) { if (await evaluate(expr)) return true; await wait(100); }
    throw Error('Timed out waiting for: ' + expr);
  };
  const KEYS = { Space: { key: ' ', code: 'Space', keyCode: 32 }, Enter: { key: 'Enter', code: 'Enter', keyCode: 13 }, Escape: { key: 'Escape', code: 'Escape', keyCode: 27 } };
  const key = async (name, dir) => {
    const k = KEYS[name];
    await call('Input.dispatchKeyEvent', { type: dir === 'up' ? 'keyUp' : 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, text: dir === 'up' ? undefined : (name === 'Enter' ? '\r' : name === 'Space' ? ' ' : undefined) });
  };
  const press = async (name, holdMs) => { await key(name, 'down'); await wait(holdMs || 120); await key(name, 'up'); await wait(90); };
  const shot = async (file) => {
    const s = await call('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    return file;
  };
  const go = async (url) => { await call('Page.navigate', { url: base + url }); };
  const close = async () => {
    try { ws.close(); } catch (e) { /* ignore */ }
    try { chrome.kill(); } catch (e) { /* ignore */ }
    server.close();
    await wait(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold files */ }
  };
  return { call, evaluate, until, key, press, shot, go, close, errors, logs, base, wait };
}

module.exports = { open, wait, root };
