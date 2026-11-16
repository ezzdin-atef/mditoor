/**
 * Inline text of a block as a flat list of formatted runs.
 *
 * Markdown is the stored form; the editable DOM is built from runs and read back into runs,
 * so formatting commands never depend on what the webview does to the markup.
 */
import { Lexer, type Token } from 'marked';

export interface Marks {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  c?: boolean;
  /** Link destination exactly as written inside `(...)`, title included. */
  a?: string;
}

export interface Run extends Marks {
  text: string;
  /** An inline image: `text` is IMG_CHAR and this holds its markdown. */
  img?: { raw: string; src: string; alt: string };
}

export type MarkKey = 'b' | 'i' | 's' | 'c';

/** Stands in for an inline image so offsets count it as one character. */
export const IMG_CHAR = '￼';

const sameMarks = (x: Marks, y: Marks) =>
  !!x.b === !!y.b && !!x.i === !!y.i && !!x.s === !!y.s && !!x.c === !!y.c && (x.a ?? null) === (y.a ?? null);

export const marksOf = (r: Marks): Marks => ({ b: r.b, i: r.i, s: r.s, c: r.c, a: r.a });

/** Joins neighbours with identical formatting and drops empty runs. */
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && !last.img && !r.img && sameMarks(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

export const plainOf = (runs: Run[]) => runs.map(r => r.text).join('');

/* ─── Markdown -> runs ───────────────────────────────────────────────── */

/** The `(...)` part of an inline link, or null for autolinks and reference links. */
function linkDest(raw: string): string | null {
  if (!raw.startsWith('[') || !raw.endsWith(')')) return null;
  const at = raw.lastIndexOf('](');
  return at === -1 ? null : raw.slice(at + 2, -1);
}

export function mdToRuns(md: string): Run[] {
  if (!md) return [];
  const runs: Run[] = [];
  const walk = (tokens: Token[], marks: Marks) => {
    for (const t of tokens) {
      const kids = (t as { tokens?: Token[] }).tokens;
      if (t.type === 'strong' && kids) walk(kids, { ...marks, b: true });
      else if (t.type === 'em' && kids) walk(kids, { ...marks, i: true });
      else if (t.type === 'del' && kids) walk(kids, { ...marks, s: true });
      else if (t.type === 'codespan') runs.push({ ...marks, c: true, text: codeText(t.raw) });
      else if (t.type === 'link' && kids && linkDest(t.raw) !== null) walk(kids, { ...marks, a: linkDest(t.raw)! });
      else if (t.type === 'image') runs.push({ ...marks, text: IMG_CHAR, img: { raw: t.raw, src: (t as { href: string }).href, alt: (t as { text: string }).text } });
      else if (t.type === 'text' && kids && kids.length) walk(kids, marks);
      // Escapes, raw HTML / JSX, hard breaks, autolinks: kept exactly as written.
      else runs.push({ ...marks, text: t.raw });
    }
  };
  try {
    const tokens = Lexer.lexInline(md);
    // The lexer must account for every character; if it ever doesn't, show the source as-is.
    if (tokens.map(t => t.raw).join('') !== md) return [{ text: md }];
    walk(tokens, {});
  } catch {
    return [{ text: md }];
  }
  return mergeRuns(runs);
}

/** The content of a code span, without its backtick fence and optional padding spaces. */
function codeText(raw: string): string {
  const m = /^(`+)([\s\S]*)\1$/.exec(raw);
  let inner = m ? m[2] : raw;
  if (inner.length > 2 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim()) inner = inner.slice(1, -1);
  return inner;
}

/* ─── Runs -> markdown ───────────────────────────────────────────────── */

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(t => t.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return fence + pad + text + pad + fence;
}

/**
 * `**bold **` is not valid emphasis: whitespace at the edge of a formatted stretch moves
 * out of it (keeping only the formatting it shares with its neighbour).
 */
function hoistEdgeSpace(runs: Run[]): Run[] {
  const out: Run[] = [];
  const shared = (r: Run, other: Run | undefined): Marks => ({
    b: r.b && other?.b, i: r.i && other?.i, s: r.s && other?.s, c: r.c,
    a: other && other.a === r.a ? r.a : undefined,
  });
  runs.forEach((r, k) => {
    if (r.img || r.c || !(r.b || r.i || r.s || r.a)) { out.push(r); return; }
    const lead = /^\s+/.exec(r.text)?.[0] ?? '';
    const rest = r.text.slice(lead.length);
    const trail = /\s+$/.exec(rest)?.[0] ?? '';
    const core = rest.slice(0, rest.length - trail.length);
    if (lead) out.push({ ...shared(r, runs[k - 1]), text: lead });
    if (core) out.push({ ...r, text: core });
    if (trail) out.push({ ...shared(r, runs[k + 1]), text: trail });
  });
  return mergeRuns(out);
}

type Wrap = 'a' | 'b' | 'i' | 's';
const WRAPS: Wrap[] = ['a', 'b', 'i', 's'];

function generate(runs: Run[], italic: '*' | '_'): string {
  const open = (w: Wrap) => (w === 'a' ? '[' : w === 'b' ? '**' : w === 'i' ? italic : '~~');
  const close = (w: Wrap, dest: string) => (w === 'a' ? `](${dest})` : open(w));
  const has = (r: Run, w: Wrap, dest: string | undefined) => (w === 'a' ? r.a !== undefined && r.a === dest : !!r[w]);
  // How many runs from `k` on keep this formatting: longer stretches open first (outermost).
  const reach = (k: number, w: Wrap, dest: string | undefined) => {
    let n = k;
    while (n < runs.length && has(runs[n], w, dest)) n += 1;
    return n - k;
  };

  let out = '';
  const stack: { w: Wrap; dest: string }[] = [];
  runs.forEach((r, k) => {
    let keep = 0;
    while (keep < stack.length && has(r, stack[keep].w, stack[keep].dest)) keep += 1;
    while (stack.length > keep) { const top = stack.pop()!; out += close(top.w, top.dest); }
    const opening = WRAPS
      .filter(w => (w === 'a' ? r.a !== undefined : !!r[w]) && !stack.some(s => s.w === w))
      .sort((x, y) => reach(k, y, r.a) - reach(k, x, r.a));
    for (const w of opening) { stack.push({ w, dest: r.a ?? '' }); out += open(w); }
    out += r.img ? r.img.raw : r.c ? codeSpan(r.text) : r.text;
  });
  while (stack.length) { const top = stack.pop()!; out += close(top.w, top.dest); }
  return out;
}

const sameRuns = (x: Run[], y: Run[]) =>
  x.length === y.length && x.every((r, k) => r.text === y[k].text && sameMarks(r, y[k]));

export function runsToMd(input: Run[]): string {
  const runs = hoistEdgeSpace(mergeRuns(input));
  if (runs.every(r => !r.b && !r.i && !r.s && !r.c && !r.a && !r.img)) return plainOf(runs);
  // Touching delimiters (`*a***b**`) can read differently, so each form is checked by reading
  // it back. Asterisks are the default; underscores step in when they avoid a pile-up (`*****`).
  const forms = [generate(runs, '*'), generate(runs, '_')];
  const valid = forms.filter(md => sameRuns(mdToRuns(md), runs));
  const pile = (md: string) => Math.max(0, ...(md.match(/\*{4,}/g) ?? []).map(m => m.length));
  return valid.sort((x, y) => pile(x) - pile(y))[0] ?? forms[0];
}

/* ─── Editing runs ───────────────────────────────────────────────────── */

/** Splits runs at a text offset. */
export function splitRuns(runs: Run[], offset: number): [Run[], Run[]] {
  const left: Run[] = [];
  const right: Run[] = [];
  let acc = 0;
  for (const r of runs) {
    const end = acc + r.text.length;
    if (end <= offset) left.push(r);
    else if (acc >= offset) right.push(r);
    else {
      left.push({ ...r, text: r.text.slice(0, offset - acc) });
      right.push({ ...r, text: r.text.slice(offset - acc) });
    }
    acc = end;
  }
  return [left, right];
}

export function sliceRuns(runs: Run[], start: number, end: number): Run[] {
  return splitRuns(splitRuns(runs, end)[0], start)[1];
}

export function replaceRange(runs: Run[], start: number, end: number, insert: Run[]): Run[] {
  return mergeRuns([...splitRuns(runs, start)[0], ...insert, ...splitRuns(runs, end)[1]]);
}

/** Formatting that typed text would get at `offset`: that of the character before it. */
export function marksAt(runs: Run[], offset: number): Marks {
  let acc = 0;
  for (const r of runs) {
    acc += r.text.length;
    if (offset <= acc && !r.img) return marksOf(r);
  }
  return {};
}

/** True when every character in the range has the mark. */
export function rangeHas(runs: Run[], start: number, end: number, key: MarkKey): boolean {
  const inside = sliceRuns(runs, start, end).filter(r => !r.img && r.text.trim());
  return inside.length > 0 && inside.every(r => !!r[key]);
}

export function setMark(runs: Run[], start: number, end: number, patch: Marks): Run[] {
  const [head, tail] = splitRuns(runs, start);
  const [mid, rest] = splitRuns(tail, end - start);
  return mergeRuns([...head, ...mid.map(r => (r.img ? r : { ...r, ...patch })), ...rest]);
}

/** The whole link around `offset`, as a text range. */
export function linkRangeAt(runs: Run[], offset: number): { start: number; end: number; dest: string } | null {
  let acc = 0;
  const spans = runs.map(r => { const s = { start: acc, end: acc + r.text.length, a: r.a }; acc = s.end; return s; });
  const hit = spans.findIndex(s => s.a !== undefined && offset >= s.start && offset <= s.end);
  if (hit === -1) return null;
  let from = hit;
  let to = hit;
  while (from > 0 && spans[from - 1].a === spans[hit].a) from -= 1;
  while (to < spans.length - 1 && spans[to + 1].a === spans[hit].a) to += 1;
  return { start: spans[from].start, end: spans[to].end, dest: spans[hit].a! };
}

/** The address in a link destination (drops `<...>` and a title). */
export function hrefOf(dest: string): string {
  const d = dest.trim();
  if (d.startsWith('<')) return d.slice(1, d.indexOf('>') === -1 ? undefined : d.indexOf('>'));
  return d.split(/\s+/)[0] ?? '';
}

/* ─── Runs <-> DOM ───────────────────────────────────────────────────── */

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (t: string) => esc(t).replace(/"/g, '&quot;');

export function runsToHtml(runs: Run[]): string {
  let html = '';
  for (const r of runs) {
    if (r.img) {
      html += `<img class="inline-img" data-raw="${attr(r.img.raw)}" data-src="${attr(r.img.src)}" alt="${attr(r.img.alt)}" />`;
      continue;
    }
    let h = esc(r.text);
    if (r.c) h = `<code class="inline-code">${h}</code>`;
    if (r.s) h = `<del>${h}</del>`;
    if (r.i) h = `<em>${h}</em>`;
    if (r.b) h = `<strong>${h}</strong>`;
    if (r.a !== undefined) h = `<a class="inline-link" data-dest="${attr(r.a)}">${h}</a>`;
    html += h;
  }
  // A final newline needs something after it to show as an empty last line.
  if (html.endsWith('\n')) html += '<br>';
  return html;
}

const MARK_TAGS: Record<string, Marks> = {
  STRONG: { b: true }, B: { b: true },
  EM: { i: true }, I: { i: true },
  DEL: { s: true }, S: { s: true }, STRIKE: { s: true },
  CODE: { c: true },
};

export function domToRuns(root: HTMLElement): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node, marks: Marks) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        runs.push({ ...marks, text: child.nodeValue ?? '' });
        return;
      }
      if (!(child instanceof HTMLElement)) return;
      if (child.tagName === 'IMG') {
        const raw = child.dataset.raw;
        if (raw) runs.push({ ...marks, text: IMG_CHAR, img: { raw, src: child.dataset.src ?? '', alt: child.getAttribute('alt') ?? '' } });
        return;
      }
      if (child.tagName === 'BR') {
        // The last <br> only keeps an empty final line visible.
        if (!isTrailingBr(root, child)) runs.push({ ...marks, text: '\n' });
        return;
      }
      const isBlock = child.tagName === 'DIV' || child.tagName === 'P';
      if (isBlock && runs.length) runs.push({ ...marks, text: '\n' });
      const add = child.tagName === 'A' && child.dataset.dest !== undefined ? { a: child.dataset.dest } : MARK_TAGS[child.tagName];
      walk(child, add ? { ...marks, ...add } : marks);
    });
  };
  walk(root, {});
  return mergeRuns(runs);
}

function isTrailingBr(root: HTMLElement, br: Node): boolean {
  let n: Node | null = br;
  while (n && n !== root) {
    if (n.nextSibling) return false;
    n = n.parentNode;
  }
  return true;
}

/* ─── Caret <-> text offsets ─────────────────────────────────────────── */

/** Text offset of a DOM position inside `root` (an image counts as one character). */
export function pointToOffset(root: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  const size = (n: Node): number => {
    if (n.nodeType === Node.TEXT_NODE) return (n.nodeValue ?? '').length;
    if (!(n instanceof HTMLElement)) return 0;
    if (n.tagName === 'IMG') return 1;
    if (n.tagName === 'BR') return isTrailingBr(root, n) ? 0 : 1;
    let sum = 0;
    n.childNodes.forEach(c => { sum += size(c); });
    return sum;
  };
  const walk = (n: Node): boolean => {
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) total += offset;
      else for (let k = 0; k < offset && k < n.childNodes.length; k += 1) total += size(n.childNodes[k]);
      return true;
    }
    if (n.nodeType !== Node.ELEMENT_NODE || !n.hasChildNodes()) { total += size(n); return false; }
    for (const c of Array.from(n.childNodes)) if (walk(c)) return true;
    return false;
  };
  walk(root);
  return total;
}

/** DOM position for a text offset; at a formatting boundary it stays in the earlier node. */
export function offsetToPoint(root: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => (n.nodeType === Node.TEXT_NODE || (n as HTMLElement).tagName === 'IMG' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  let acc = 0;
  let lastText: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n.nodeValue ?? '').length;
      if (offset <= acc + len) return [n, Math.max(0, offset - acc)];
      acc += len;
      lastText = n as Text;
    } else {
      const parent = n.parentNode!;
      const index = Array.prototype.indexOf.call(parent.childNodes, n);
      if (offset <= acc) return [parent, index];
      acc += 1;
      if (offset === acc) return [parent, index + 1];
    }
  }
  if (lastText && offset <= acc) return [lastText, (lastText.nodeValue ?? '').length];
  // Past the end (or an empty block): before the trailing filler <br>, if there is one.
  const last = root.lastChild;
  const count = root.childNodes.length;
  return [root, last instanceof HTMLElement && last.tagName === 'BR' ? count - 1 : count];
}

/** The selection inside `root` as text offsets (start <= end), or null when it is elsewhere. */
export function getOffsets(root: HTMLElement): { start: number; end: number; backward: boolean } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const a = pointToOffset(root, sel.anchorNode, sel.anchorOffset);
  const f = pointToOffset(root, sel.focusNode, sel.focusOffset);
  return { start: Math.min(a, f), end: Math.max(a, f), backward: f < a };
}

export function setOffsets(root: HTMLElement, start: number, end = start) {
  const sel = window.getSelection();
  if (!sel) return;
  const [sn, so] = offsetToPoint(root, start);
  const [en, eo] = end === start ? [sn, so] : offsetToPoint(root, end);
  sel.setBaseAndExtent(sn, so, en, eo);
}

/**
 * Where a caret at `offset` in `before` lands in `after`, when `after` is `before` with
 * some characters removed (markdown markers that just turned into formatting).
 */
export function mapOffset(before: string, after: string, offset: number): number {
  let j = 0;
  for (let i = 0; i < offset && i < before.length && j < after.length; i += 1) {
    if (before[i] === after[j]) j += 1;
  }
  return j;
}

/** Screen rectangle of the caret (the focus end of the selection), or null. */
export function caretRect(root: HTMLElement): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.focusNode || !root.contains(sel.focusNode)) return null;
  const range = document.createRange();
  range.setStart(sel.focusNode, sel.focusOffset);
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length) return rects[rects.length - 1];
  // Collapsed ranges at a line start (or in an empty block) often have no rectangle: measure a neighbour.
  const node = sel.focusNode;
  if (node.nodeType === Node.TEXT_NODE) {
    const len = (node.nodeValue ?? '').length;
    const at = sel.focusOffset;
    if (at < len) {
      range.setEnd(node, at + 1);
      const r = range.getClientRects()[0];
      if (r) return new DOMRect(getComputedStyle(root).direction === 'rtl' ? r.right : r.left, r.top, 0, r.height);
    }
    if (at > 0) {
      range.setStart(node, at - 1);
      range.setEnd(node, at);
      const all = range.getClientRects();
      const r = all[all.length - 1];
      // After a newline the caret is on the next line, not beside the newline.
      if (r && node.nodeValue![at - 1] !== '\n') return new DOMRect(getComputedStyle(root).direction === 'rtl' ? r.left : r.right, r.top, 0, r.height);
    }
  }
  return null;
}
