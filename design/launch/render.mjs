// Renders launch.html compositions to PNG with headless Edge/Chrome.
// Run: node design/launch/render.mjs [only-this-name]   Output: design/launch/out/
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out');
const PAGE = pathToFileURL(join(here, 'launch.html')).href;
const PORT = 9334;
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

// Covers render at the exact size platforms ask for; framed shots at 2x for crisp text.
const framed = ['posts', 'editor', 'rtl', 'git', 'ideas', 'metadata', 'images', 'palette'];
const JOBS = [
  { name: 'cover-1200x630', v: 'cover', w: 1200, h: 630, dpr: 1 },
  { name: 'cover-1200x630@2x', v: 'cover', w: 1200, h: 630, dpr: 2 },
  { name: 'cover-rtl-dark-1200x630', v: 'cover-rtl', w: 1200, h: 630, dpr: 1 },
  { name: 'cover-rtl-dark-1200x630@2x', v: 'cover-rtl', w: 1200, h: 630, dpr: 2 },
  { name: 'cover-devto-1000x420', v: 'devto', w: 1000, h: 420, dpr: 1 },
  { name: 'cover-devto-1000x420@2x', v: 'devto', w: 1000, h: 420, dpr: 2 },
  { name: 'cover-square-1080', v: 'square', w: 1080, h: 1080, dpr: 1 },
  ...framed.map((k, i) => ({ name: `shot-${String(i + 1).padStart(2, '0')}-${k}`, v: `framed:${k}`, w: 1270, h: 760, dpr: 2 })),
];

const only = process.argv[2];
const proc = spawn(BROWSERS.find(existsSync), [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'mditoor-launch-profile')}`,
  '--hide-scrollbars', '--no-first-run', '--force-color-profile=srgb', '--allow-file-access-from-files', 'about:blank',
], { stdio: 'ignore' });
process.on('uncaughtException', e => { console.error(e); proc.kill(); process.exit(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pageWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('browser did not start');
}

const ws = new WebSocket(await pageWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

mkdirSync(OUT, { recursive: true });
await send('Page.enable');
for (const job of JOBS) {
  if (only && job.name !== only) continue;
  await send('Emulation.setDeviceMetricsOverride', { width: job.w, height: job.h, deviceScaleFactor: job.dpr, mobile: false });
  await send('Page.navigate', { url: `${PAGE}?v=${job.v}` });
  await sleep(600);
  await send('Runtime.evaluate', {
    expression: `Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))])`,
    awaitPromise: true,
  });
  await sleep(200);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${job.name}.png`), Buffer.from(data, 'base64'));
  console.log('rendered', job.name);
}
ws.close();
proc.kill();
