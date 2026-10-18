// Captures the app screenshots (2x, 1440x900) from the mocked UI via headless Edge/Chrome.
// Needs `pnpm dev` running. Run: node design/screenshots/capture.mjs [only-this-name]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out', 'raw');
const BASE = 'http://localhost:1420/design/screenshots/app.html';
const PORT = 9333;
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

// Each shot: query string, then optional steps run in the page (click by visible text, key presses).
const clickText = (text, sel = 'button, [role="tab"], a') => `(() => {
  const el = [...document.querySelectorAll('${sel}')].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)}));
  if (!el) throw new Error('not found: ' + ${JSON.stringify(text)});
  el.click();
})()`;
const SHOTS = [
  { name: '01-posts', query: '' },
  { name: '02-editor', query: '?post=shipping-react-server-components' },
  { name: '03-editor-split', query: '?post=shipping-react-server-components', steps: [clickText('Split')] },
  { name: '04-rtl-arabic-dark', query: '?post=arabic-typography-on-the-web&lang=ar&theme=dark' },
  { name: '05-git', query: '', steps: [clickText('Git'), `[...document.querySelectorAll('.git-file')].find(e => e.textContent.includes('shipping-react-server-components/')).click()`] },
  { name: '06-ideas', query: '', steps: [clickText('Ideas')] },
  { name: '07-images', query: '', steps: [clickText('Images')] },
  { name: '08-posts-dark', query: '?theme=dark' },
  { name: '09-command-palette', query: '', steps: [`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`] },
  { name: '10-metadata', query: '', steps: [clickText('Metadata')] },
];

const only = process.argv[2];
process.on('uncaughtException', e => { console.error(e); proc?.kill(); process.exit(1); });
const browser = BROWSERS.find(existsSync);
const profile = join(tmpdir(), 'mditoor-shots-profile');
var proc = spawn(browser, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--no-first-run', '--force-color-profile=srgb', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pageWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
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
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
};

mkdirSync(OUT, { recursive: true });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
// Windows platform so the app draws its own title bar.
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0', platform: 'Win32' });

for (const shot of SHOTS) {
  if (only && shot.name !== only) continue;
  const theme = new URLSearchParams(shot.query).get('theme') ?? 'light';
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await send('Page.navigate', { url: BASE + shot.query });
  await sleep(2500);
  for (const step of shot.steps ?? []) { await evaluate(step); await sleep(900); }
  await evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(400);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${shot.name}.png`), Buffer.from(data, 'base64'));
  console.log('captured', shot.name);
}

ws.close();
proc.kill();
