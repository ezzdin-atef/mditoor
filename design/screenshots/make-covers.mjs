// Generates the placeholder post covers used by the screenshot mock (covers/*.svg).
// Run: node design/screenshots/make-covers.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'covers');
mkdirSync(out, { recursive: true });

const W = 1200, H = 630;
const svg = (body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bg}${body}</svg>`;
const grad = (id, a, b, angle = 135) =>
  `<defs><linearGradient id="${id}" gradientTransform="rotate(${angle - 90} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})"/>`;

const covers = {
  // React Server Components: concentric orbits
  'rsc': svg(
    [0, 1, 2, 3, 4].map(i => `<circle cx="860" cy="315" r="${70 + i * 70}" fill="none" stroke="#fff" stroke-opacity="${0.5 - i * 0.08}" stroke-width="3"/>`).join('') +
    `<circle cx="860" cy="315" r="34" fill="#ffb020"/><circle cx="1000" cy="190" r="14" fill="#fff"/><circle cx="650" cy="470" r="10" fill="#fff" fill-opacity=".8"/>`,
    grad('g', '#0d8f86', '#0a5c66')),
  // Postgres indexes: b-tree
  'postgres': svg(
    `<g stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none"><path d="M600 150 L380 320 M600 150 L600 320 M600 150 L820 320 M380 320 L300 480 M380 320 L460 480 M820 320 L740 480 M820 320 L900 480"/></g>` +
    [[600, 150], [380, 320], [600, 320], [820, 320], [300, 480], [460, 480], [740, 480], [900, 480]]
      .map(([x, y], i) => `<rect x="${x - 50}" y="${y - 22}" width="100" height="44" rx="10" fill="${i === 0 ? '#ffb020' : '#fff'}" fill-opacity="${i === 0 ? 1 : 0.92}"/>`).join(''),
    grad('g', '#2f6fd6', '#1d3f8f')),
  // Arabic typography: big glyph
  'arabic': svg(
    `<text x="600" y="400" text-anchor="middle" font-family="Noto Naskh Arabic, Amiri, Segoe UI, serif" font-size="300" fill="#fff" fill-opacity=".95">حرف</text>` +
    `<rect x="380" y="470" width="440" height="6" rx="3" fill="#ffb020"/>`,
    grad('g', '#ff7a59', '#c8463a')),
  // Tauri / desktop: stacked windows
  'tauri': svg(
    [0, 1, 2].map(i => `<g transform="translate(${360 + i * 70} ${150 + i * 60})"><rect width="420" height="260" rx="18" fill="#fff" fill-opacity="${0.35 + i * 0.3}"/><circle cx="26" cy="24" r="7" fill="#13202a" fill-opacity=".3"/><circle cx="48" cy="24" r="7" fill="#13202a" fill-opacity=".3"/><circle cx="70" cy="24" r="7" fill="#13202a" fill-opacity=".3"/></g>`).join(''),
    grad('g', '#24323d', '#0d8f86', 160)),
  // Static sites: grid of tiles
  'static': svg(
    Array.from({ length: 24 }, (_, i) => {
      const x = 150 + (i % 8) * 120, y = 140 + Math.floor(i / 8) * 120;
      const hot = [3, 10, 12, 21].includes(i);
      return `<rect x="${x}" y="${y}" width="96" height="96" rx="16" fill="${hot ? '#ffb020' : '#fff'}" fill-opacity="${hot ? 1 : 0.18 + ((i * 7) % 5) * 0.08}"/>`;
    }).join(''),
    grad('g', '#8e4ec6', '#4b2c87')),
  // Git workflow: branches
  'git': svg(
    `<g fill="none" stroke-width="10" stroke-linecap="round"><path d="M120 315 H1080" stroke="#fff" stroke-opacity=".9"/><path d="M300 315 C380 315 380 170 470 170 H700 C790 170 790 315 870 315" stroke="#ffb020"/></g>` +
    [[120, 315], [300, 315], [520, 315], [870, 315], [1080, 315], [470, 170], [700, 170]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="22" fill="#13202a" stroke="#fff" stroke-width="8"/>`).join(''),
    grad('g', '#12a150', '#0b6b5e')),
};

for (const [name, content] of Object.entries(covers)) writeFileSync(join(out, `${name}.svg`), content);
console.log('wrote', Object.keys(covers).length, 'covers to', out);
