/** The block document model: markdown <-> blocks, list numbering, and text direction. */

export type BlockType =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3'
  | 'quote' | 'bullet' | 'numbered' | 'todo'
  | 'code' | 'callout' | 'table' | 'divider';

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  /** Nesting level of a list item (0 = top level). */
  indent?: number;
  /** To-do items only. */
  checked?: boolean;
}

export type Dir = 'rtl' | 'ltr';

/** Blocks whose text is edited inline (everything but code, tables and dividers). */
export const TEXT_TYPES: BlockType[] = ['paragraph', 'heading1', 'heading2', 'heading3', 'quote', 'bullet', 'numbered', 'todo', 'callout'];
export const LIST_TYPES: BlockType[] = ['bullet', 'numbered', 'todo'];

export const isText = (type: BlockType) => TEXT_TYPES.includes(type);
export const isList = (type: BlockType) => LIST_TYPES.includes(type);

export function newId() {
  return crypto.randomUUID();
}

export function block(type: BlockType, text = '', extra: Partial<Block> = {}): Block {
  return { id: newId(), type, text, ...extra };
}

/* ─── Direction ──────────────────────────────────────────────────────── */

// Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan ... and the Arabic presentation forms.
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LETTER = /\p{L}/gu;

/**
 * Direction of a piece of writing, or null when it has no letters (empty, digits, symbols).
 *
 * The script with more letters wins, so an Arabic sentence that opens with an English term
 * ("React هي مكتبة ...") still reads right-to-left; a tie goes to the first letter. Inline
 * code, link targets and tags are ignored: they are left-to-right whatever the prose is.
 */
export function detectDir(text: string): Dir | null {
  const prose = text
    .slice(0, 600)
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\]\([^)\n]*\)/g, ' ')
    .replace(/<[^>\n]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
  let rtl = 0;
  let ltr = 0;
  let first: Dir | null = null;
  for (const m of prose.matchAll(LETTER)) {
    const dir: Dir = RTL_LETTER.test(m[0]) ? 'rtl' : 'ltr';
    first ??= dir;
    if (dir === 'rtl') rtl += 1; else ltr += 1;
  }
  if (!first) return null;
  if (rtl === ltr) return first;
  return rtl > ltr ? 'rtl' : 'ltr';
}

/** The prose of a block, for direction detection. */
function proseOf(b: Block): string {
  if (b.type === 'callout') return calloutParts(b.text).content;
  if (b.type === 'table') return b.text.replace(/\|/g, ' ');
  return b.text;
}

/**
 * Direction of every block. A block without letters (a new empty line, "2024") follows the
 * text block before it, so pressing Enter in an Arabic paragraph keeps the caret on the right.
 */
export function blockDirs(blocks: Block[], fallback: Dir): Dir[] {
  const dirs: (Dir | null)[] = blocks.map(b => (b.type === 'code' || b.type === 'divider' ? null : detectDir(proseOf(b))));
  // An empty block at the very top follows the first block that has text.
  let last: Dir = dirs.find((d): d is Dir => d !== null) ?? fallback;
  return blocks.map((b, i) => {
    if (b.type === 'code') return 'ltr';
    const own = dirs[i];
    if (own) last = own;
    return own ?? last;
  });
}

/* ─── Callouts, code, tables ─────────────────────────────────────────── */

export const CALLOUT_EMOJI = ['💡', '⚠️', '📝', '🔔', '✅', '❌', '💬', 'ℹ️', '🚀', '🎯', '📌', '🔥'];

export const CALLOUT_JSX_TYPES = ['info', 'warning', 'tip', 'danger', 'note', 'success', 'error'] as const;
export type CalloutJsxType = typeof CALLOUT_JSX_TYPES[number];

const CALLOUT_TYPE_EMOJI: Record<CalloutJsxType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  tip: '✅',
  danger: '❌',
  note: '📝',
  success: '✅',
  error: '❌',
};

/** A callout's text is its emoji (or `type:<name>` for `<Callout>` tags), a newline, then the content. */
export function calloutParts(text: string): { emoji: string; head: string; content: string; jsxType?: CalloutJsxType } {
  const nl = text.indexOf('\n');
  const head = nl === -1 ? (text || '💡') : text.slice(0, nl) || '💡';
  const content = nl === -1 ? '' : text.slice(nl + 1);
  if (head.startsWith('type:')) {
    const jsxType = head.slice(5) as CalloutJsxType;
    return { emoji: CALLOUT_TYPE_EMOJI[jsxType] ?? 'ℹ️', head, content, jsxType };
  }
  return { emoji: head, head, content };
}

/** The inline text of a text block (a callout's content, otherwise the text itself). */
export function textOf(b: Block): string {
  return b.type === 'callout' ? calloutParts(b.text).content : b.text;
}

/** `b` with its inline text replaced (keeps a callout's emoji line). */
export function withText(b: Block, text: string): Block {
  return b.type === 'callout' ? { ...b, text: `${calloutParts(b.text).head}\n${text}` } : { ...b, text };
}

function startsWithEmoji(str: string): boolean {
  const cp = str.codePointAt(0);
  if (cp === undefined) return false;
  return (cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || cp === 0x2139;
}

export function parseCodeText(text: string): { lang: string; code: string } {
  const nl = text.indexOf('\n');
  if (nl === -1) return { lang: '', code: text };
  const firstLine = text.slice(0, nl);
  // The first line is the language when it is a short identifier (no spaces).
  if (/^[a-zA-Z0-9+#._-]{0,20}$/.test(firstLine)) return { lang: firstLine, code: text.slice(nl + 1) };
  return { lang: '', code: text };
}

export function parseTableText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n');
  const headers = lines[0]?.split('|') ?? ['', ''];
  const colCount = headers.length;
  const rows = lines.slice(1).filter(Boolean).map(l => {
    const cells = l.split('|');
    while (cells.length < colCount) cells.push('');
    return cells.slice(0, colCount);
  });
  return { headers, rows: rows.length > 0 ? rows : [Array(colCount).fill('')] };
}

/* ─── Lists ──────────────────────────────────────────────────────────── */

/** Keeps list nesting valid: an item sits at most one level under the list item before it. */
export function normalizeIndents(blocks: Block[]): Block[] {
  let changed = false;
  let prev = -1;
  const next = blocks.map(b => {
    if (!isList(b.type)) {
      prev = -1;
      if (!b.indent) return b;
      changed = true;
      return { ...b, indent: 0 };
    }
    const indent = Math.max(0, Math.min(b.indent ?? 0, prev + 1));
    prev = indent;
    if (indent === (b.indent ?? 0)) return b;
    changed = true;
    return { ...b, indent };
  });
  return changed ? next : blocks;
}

/** The number shown for each numbered item (null for every other block). */
export function listNumbers(blocks: Block[]): (number | null)[] {
  const counters: number[] = [];
  return blocks.map(b => {
    if (!isList(b.type)) { counters.length = 0; return null; }
    const level = b.indent ?? 0;
    // Deeper levels start over under a new parent.
    counters.length = Math.min(counters.length, level + 1);
    if (b.type !== 'numbered') { counters[level] = 0; return null; }
    counters[level] = (counters[level] ?? 0) + 1;
    return counters[level];
  });
}

/* ─── Markdown -> blocks ─────────────────────────────────────────────── */

const LIST_LINE = /^(\s*)(?:([-*+])|(\d{1,9})[.)])(?:\s+(.*))?$/;
const TODO_TEXT = /^\[( |x|X)\](?:\s+(.*))?$/;

const columns = (ws: string) => ws.replace(/\t/g, '    ').length;

export function parseMarkdownBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  // Indentation (in columns) of each open list level; empty outside a list.
  let listCols: number[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(block('paragraph', paragraph.join('\n')));
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushParagraph();
      listCols = [];
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push(block('code', lang + '\n' + codeLines.join('\n')));
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    // Thematic breaks (---, ***, ___) come before lists: `* * *` is a rule, not a bullet.
    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      listCols = [];
      blocks.push(block('divider'));
      continue;
    }

    const item = LIST_LINE.exec(line);
    // A lone marker in the middle of a paragraph ("-") is text, not an empty list item.
    if (item && (item[4] !== undefined || paragraph.length === 0)) {
      flushParagraph();
      const cols = columns(item[1]);
      while (listCols.length && cols < listCols[listCols.length - 1]) listCols.pop();
      if (!listCols.length || cols > listCols[listCols.length - 1]) listCols.push(cols);
      const indent = listCols.length - 1;
      let text = item[4] ?? '';
      // Indented lines right under an item continue its text.
      const lineIndent = (l: string) => columns(/^\s*/.exec(l)![0]);
      while (i + 1 < lines.length && lines[i + 1].trim() && lineIndent(lines[i + 1]) > cols && !LIST_LINE.test(lines[i + 1]) && !lines[i + 1].trimStart().startsWith('```')) {
        i += 1;
        text += '\n' + lines[i].trimStart();
      }
      const todo = item[2] ? TODO_TEXT.exec(text) : null;
      if (todo) blocks.push(block('todo', todo[2] ?? '', { indent, checked: todo[1] !== ' ' }));
      else blocks.push(block(item[2] ? 'bullet' : 'numbered', text, { indent }));
      continue;
    }
    listCols = [];

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(block(level === 1 ? 'heading1' : level === 2 ? 'heading2' : 'heading3', heading[2]));
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      const quoteLines = [quote[1]];
      while (i + 1 < lines.length) {
        const next = /^>\s?(.*)$/.exec(lines[i + 1]);
        if (!next) break;
        quoteLines.push(next[1]);
        i += 1;
      }
      // A quote that opens with an emoji is a callout.
      const firstWord = quoteLines[0].split(' ')[0];
      if (startsWithEmoji(firstWord)) {
        quoteLines[0] = quoteLines[0].slice(firstWord.length).trimStart();
        blocks.push(block('callout', firstWord + '\n' + quoteLines.join('\n')));
      } else {
        blocks.push(block('quote', quoteLines.join('\n')));
      }
      continue;
    }

    // JSX callout: <Callout type="...">...</Callout>
    const jsxCalloutOpen = /^<Callout\s+type="([^"]+)"\s*>/.exec(line);
    if (jsxCalloutOpen) {
      flushParagraph();
      const afterOpen = line.slice(jsxCalloutOpen[0].length);
      const contentLines: string[] = [];
      if (afterOpen.includes('</Callout>')) {
        const inner = afterOpen.slice(0, afterOpen.indexOf('</Callout>')).trimEnd();
        if (inner) contentLines.push(inner);
      } else {
        if (afterOpen) contentLines.push(afterOpen);
        while (i + 1 < lines.length) {
          i += 1;
          if (lines[i].trim() === '</Callout>') break;
          contentLines.push(lines[i]);
        }
      }
      blocks.push(block('callout', `type:${jsxCalloutOpen[1]}\n${contentLines.join('\n')}`));
      continue;
    }

    // Pipe tables
    if (/^\|.+\|/.test(line.trim())) {
      flushParagraph();
      const tableLines = [line];
      while (i + 1 < lines.length && /^\|.+\|/.test(lines[i + 1].trim())) {
        i += 1;
        tableLines.push(lines[i]);
      }
      // Separator rows (| --- | --- |) carry no content.
      const dataLines = tableLines.filter(l => !/^\|\s*[-: |]+\|\s*$/.test(l.trim()));
      const parsedRows = dataLines.map(l =>
        l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
      if (parsedRows.length >= 1) blocks.push(block('table', parsedRows.map(r => r.join('|')).join('\n')));
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.length > 0 ? blocks : [block('paragraph')];
}

/* ─── Blocks -> markdown ─────────────────────────────────────────────── */

function serializeBlock(b: Block): string {
  const text = b.text.trimEnd();
  if (b.type === 'callout') {
    const { emoji, content, jsxType } = calloutParts(text);
    if (!content.trim()) return '';
    if (jsxType) return `<Callout type="${jsxType}">\n${content}\n</Callout>`;
    return content.split('\n').map((line, i) => (i === 0 ? `> ${emoji} ${line}` : `> ${line}`)).join('\n');
  }
  if (b.type === 'divider') return '---';
  if (b.type === 'table') {
    const dataLines = text.split('\n').filter(Boolean);
    if (!dataLines.length) return '';
    const allRows = dataLines.map(l => l.split('|'));
    const colCount = Math.max(...allRows.map(r => r.length));
    const padded = allRows.map(r => {
      const row = [...r];
      while (row.length < colCount) row.push('');
      return row;
    });
    const line = (row: string[]) => '| ' + row.map(c => c || ' ').join(' | ') + ' |';
    return [line(padded[0]), '| ' + Array(colCount).fill('---').join(' | ') + ' |', ...padded.slice(1).map(line)].join('\n');
  }
  if (!text) return '';
  if (b.type === 'heading1') return `# ${text}`;
  if (b.type === 'heading2') return `## ${text}`;
  if (b.type === 'heading3') return `### ${text}`;
  if (b.type === 'quote') return text.split('\n').map(line => `> ${line}`).join('\n');
  if (b.type === 'code') {
    const { lang, code } = parseCodeText(text);
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }
  return text;
}

export function serializeMarkdownBlocks(blocks: Block[]): string {
  const result: string[] = [];
  const numbers = listNumbers(blocks);
  // Width of the marker at each open list level; children are indented under their parent's text.
  let widths: number[] = [];
  // Whether the list being written is numbered at its top level (null outside a list).
  let topNumbered: boolean | null = null;

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    let text: string;

    if (isList(b.type)) {
      const body = b.text.trimEnd();
      if (!body && b.type !== 'todo') continue;
      const level = Math.min(b.indent ?? 0, widths.length);
      const pad = ' '.repeat(widths.slice(0, level).reduce((a, w) => a + w, 0));
      const marker = b.type === 'numbered' ? `${numbers[i] ?? 1}. ` : '- ';
      const box = b.type === 'todo' ? `[${b.checked ? 'x' : ' '}] ` : '';
      const hang = pad + ' '.repeat(marker.length);
      text = pad + marker + (box + body.split('\n').join('\n' + hang)).trimEnd();
      widths = [...widths.slice(0, level), marker.length];
      // Items of one list sit on consecutive lines; a different kind of list starts after a blank line.
      const numbered = b.type === 'numbered';
      const sameList = topNumbered !== null && (level > 0 || topNumbered === numbered);
      result.push(sameList ? '\n' : result.length > 0 ? '\n\n' : '');
      if (level === 0) topNumbered = numbered;
    } else {
      text = serializeBlock(b);
      if (!text) continue;
      widths = [];
      topNumbered = null;
      result.push(result.length > 0 ? '\n\n' : '');
    }
    result.push(text);
  }

  return result.join('');
}
