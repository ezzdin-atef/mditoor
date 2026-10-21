import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import hljs from 'highlight.js/lib/core';
import { CustomSelect } from '../../../components/CustomSelect';
import { ResolvedImg, useEditorImages, useInlineImages, usePreparedImages } from './EditorImages';
import langBash from 'highlight.js/lib/languages/bash';
import langC from 'highlight.js/lib/languages/c';
import langCpp from 'highlight.js/lib/languages/cpp';
import langCss from 'highlight.js/lib/languages/css';
import langGo from 'highlight.js/lib/languages/go';
import langHtml from 'highlight.js/lib/languages/xml';
import langJava from 'highlight.js/lib/languages/java';
import langJs from 'highlight.js/lib/languages/javascript';
import langJson from 'highlight.js/lib/languages/json';
import langMarkdown from 'highlight.js/lib/languages/markdown';
import langPhp from 'highlight.js/lib/languages/php';
import langPython from 'highlight.js/lib/languages/python';
import langRs from 'highlight.js/lib/languages/rust';
import langRuby from 'highlight.js/lib/languages/ruby';
import langShell from 'highlight.js/lib/languages/shell';
import langSql from 'highlight.js/lib/languages/sql';
import langSwift from 'highlight.js/lib/languages/swift';
import langTs from 'highlight.js/lib/languages/typescript';
import langYaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', langBash);
hljs.registerLanguage('c', langC);
hljs.registerLanguage('cpp', langCpp);
hljs.registerLanguage('css', langCss);
hljs.registerLanguage('go', langGo);
hljs.registerLanguage('html', langHtml);
hljs.registerLanguage('xml', langHtml);
hljs.registerLanguage('java', langJava);
hljs.registerLanguage('javascript', langJs);
hljs.registerLanguage('js', langJs);
hljs.registerLanguage('json', langJson);
hljs.registerLanguage('markdown', langMarkdown);
hljs.registerLanguage('php', langPhp);
hljs.registerLanguage('python', langPython);
hljs.registerLanguage('ruby', langRuby);
hljs.registerLanguage('rust', langRs);
hljs.registerLanguage('shell', langShell);
hljs.registerLanguage('sql', langSql);
hljs.registerLanguage('swift', langSwift);
hljs.registerLanguage('typescript', langTs);
hljs.registerLanguage('ts', langTs);
hljs.registerLanguage('yaml', langYaml);

type BlockType = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'bullet' | 'numbered' | 'code' | 'callout' | 'table' | 'divider';

interface Block {
  id: string;
  type: BlockType;
  text: string;
}

interface SlashItem {
  /** `image` is not a block type: it uploads a file and inserts a markdown image. */
  type: BlockType | 'image';
  label: string;
  hint: string;
  marker: string;
  /** Extra words the `/` filter matches, e.g. `h1` for Heading 1. */
  keywords: string[];
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  editorStyle: React.CSSProperties;
  onInsertImage?: () => Promise<string | null>;
}

const SLASH_ITEMS: SlashItem[] = [
  { type: 'paragraph', label: 'Text',         hint: 'Plain paragraph',         marker: 'T',   keywords: ['paragraph', 'plain', 'p'] },
  { type: 'heading1',  label: 'Heading 1',    hint: 'Large section title',     marker: 'H1',  keywords: ['h1', 'title', '#'] },
  { type: 'heading2',  label: 'Heading 2',    hint: 'Medium section title',    marker: 'H2',  keywords: ['h2', 'subtitle', '##'] },
  { type: 'heading3',  label: 'Heading 3',    hint: 'Small section title',     marker: 'H3',  keywords: ['h3', '###'] },
  { type: 'bullet',    label: 'Bullet list',  hint: 'Simple unordered item',   marker: '•',   keywords: ['ul', 'list', 'unordered', '-'] },
  { type: 'numbered',  label: 'Numbered list',hint: 'Ordered item',            marker: '1.',  keywords: ['ol', 'list', 'ordered'] },
  { type: 'quote',     label: 'Quote',        hint: 'Call out quoted text',    marker: '"',   keywords: ['blockquote', '>'] },
  { type: 'callout',   label: 'Callout',      hint: 'Highlighted note or tip', marker: '💡',  keywords: ['note', 'tip', 'warning', 'info'] },
  { type: 'table',     label: 'Table',        hint: 'Insert a structured table', marker: 'tbl', keywords: ['grid', 'columns'] },
  { type: 'divider',   label: 'Divider',      hint: 'Horizontal separator line', marker: '—', keywords: ['hr', 'line', 'separator', '---'] },
  { type: 'code',      label: 'Code',         hint: 'Always left-to-right',    marker: '</>', keywords: ['snippet', 'pre', '```'] },
  { type: 'image',     label: 'Image',        hint: 'Upload and insert markdown image', marker: 'img', keywords: ['picture', 'photo', 'img', 'upload'] },
];

/** The filter after `/` when the whole block is a slash command (`/im`, `/heading 2`), else null. */
function slashQuery(text: string): string | null {
  const m = /^\/([^\s/][^\n/]{0,23})?$/.exec(text.trimEnd());
  return m ? (m[1] ?? '') : null;
}

/** Items matching the query: label prefix first, then keyword prefix, then anywhere in label or hint. */
function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const rank = (item: SlashItem) => {
    const label = item.label.toLowerCase();
    if (label.startsWith(q) || label.split(' ').some(w => w.startsWith(q))) return 0;
    if (item.keywords.some(k => k.startsWith(q))) return 1;
    if (label.includes(q) || item.hint.toLowerCase().includes(q)) return 2;
    return -1;
  };
  return items
    .map(item => ({ item, r: rank(item) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map(x => x.item);
}

/** Drag payload type; a custom type so text fields never accept the drop as pasted text. */
const BLOCK_MIME = 'application/x-mditoor-block';

/** Block types offered by the right-click "Turn into" menu (they keep the block's text). */
const TURN_INTO: BlockType[] = ['paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'quote', 'callout', 'code'];

const CALLOUT_EMOJI = ['💡', '⚠️', '📝', '🔔', '✅', '❌', '💬', 'ℹ️', '🚀', '🎯', '📌', '🔥'];

const CALLOUT_JSX_TYPES = ['info', 'warning', 'tip', 'danger', 'note', 'success', 'error'] as const;
type CalloutJsxType = typeof CALLOUT_JSX_TYPES[number];

const CALLOUT_TYPE_EMOJI: Record<CalloutJsxType, string> = {
  info:    'ℹ️',
  warning: '⚠️',
  tip:     '✅',
  danger:  '❌',
  note:    '📝',
  success: '✅',
  error:   '❌',
};

function calloutParts(text: string): { emoji: string; content: string; jsxType?: CalloutJsxType } {
  const nl = text.indexOf('\n');
  const rawEmoji = nl === -1 ? (text || '💡') : text.slice(0, nl);
  const content  = nl === -1 ? '' : text.slice(nl + 1);
  if (rawEmoji.startsWith('type:')) {
    const jsxType = rawEmoji.slice(5) as CalloutJsxType;
    return { emoji: CALLOUT_TYPE_EMOJI[jsxType] ?? 'ℹ️', content, jsxType };
  }
  return { emoji: rawEmoji || '💡', content };
}

function detectDir(text: string): 'rtl' | 'ltr' {
  // Strong RTL code-point ranges: Arabic, Hebrew, Syriac, Thaana, NKo, Samaritan …
  return /[֐-ࣿיִ-﷽ﹰ-﻿]/.test(text.trim().slice(0, 200))
    ? 'rtl'
    : 'ltr';
}

function startsWithEmoji(str: string): boolean {
  const cp = str.codePointAt(0);
  if (cp === undefined) return false;
  return (cp >= 0x1F300 && cp <= 0x1FAFF) ||
    (cp >= 0x2600  && cp <= 0x27BF) ||
    cp === 0x2139;
}

const LANG_OPTIONS = [
  { value: '',           label: 'Plain text'  },
  { value: 'bash',       label: 'Bash'        },
  { value: 'c',          label: 'C'           },
  { value: 'cpp',        label: 'C++'         },
  { value: 'css',        label: 'CSS'         },
  { value: 'go',         label: 'Go'          },
  { value: 'html',       label: 'HTML'        },
  { value: 'java',       label: 'Java'        },
  { value: 'javascript', label: 'JavaScript'  },
  { value: 'json',       label: 'JSON'        },
  { value: 'markdown',   label: 'Markdown'    },
  { value: 'php',        label: 'PHP'         },
  { value: 'python',     label: 'Python'      },
  { value: 'ruby',       label: 'Ruby'        },
  { value: 'rust',       label: 'Rust'        },
  { value: 'shell',      label: 'Shell'       },
  { value: 'sql',        label: 'SQL'         },
  { value: 'swift',      label: 'Swift'       },
  { value: 'typescript', label: 'TypeScript'  },
  { value: 'yaml',       label: 'YAML'        },
];

function parseCodeText(text: string): { lang: string; code: string } {
  const nl = text.indexOf('\n');
  if (nl === -1) return { lang: '', code: text };
  const firstLine = text.slice(0, nl);
  // First line is a language if it's a short identifier (no spaces)
  if (/^[a-zA-Z0-9+#._-]{0,20}$/.test(firstLine)) {
    return { lang: firstLine, code: text.slice(nl + 1) };
  }
  return { lang: '', code: text };
}

function renderInline(raw: string): string {
  const esc = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tokens: [string, string][] = [];
  let n = 0;
  const tok = (html: string): string => {
    const k = `\x00${n++}\x00`;
    tokens.push([k, html]);
    return k;
  };
  let s = raw;
  // Inline code (verbatim – escape content)
  s = s.replace(/`([^`\n]+)`/g, (_, c) =>
    tok(`<code class="inline-code">${esc(c)}</code>`));
  // Images (before links)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    tok(`<img data-src="${esc(src).replace(/"/g, '&quot;')}" alt="${esc(alt).replace(/"/g, '&quot;')}" class="inline-img" />`));
  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
    tok(`<a href="${href}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`));
  // Bold italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, (_, t) =>
    tok(`<strong><em>${esc(t)}</em></strong>`));
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, (_, t) => tok(`<strong>${esc(t)}</strong>`));
  s = s.replace(/__(.+?)__/g, (_, t) => tok(`<strong>${esc(t)}</strong>`));
  // Italic
  s = s.replace(/\*([^*\n]+)\*/g, (_, t) => tok(`<em>${esc(t)}</em>`));
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, (_, t) => tok(`<del>${esc(t)}</del>`));
  // Escape remaining plain text
  s = esc(s);
  // Restore token HTML (already safe)
  for (const [k, html] of tokens) s = s.split(k).join(html);
  return s;
}

/** Rendered inline markdown whose images are resolved against the workspace. */
function InlineView({ text, fallback, onEdit, ...props }: {
  text: string;
  fallback: string;
  /** Called with the caret (or selection) in raw-markdown offsets where the user clicked. */
  onEdit?: (caret: [number, number] | null) => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  // A trailing newline is an empty last line in the textarea; `<br>` keeps that line here too.
  const html = usePreparedImages((renderInline(text) || fallback) + (text.endsWith('\n') ? '<br>' : ''));
  const ref = useRef<HTMLDivElement>(null);
  useInlineImages(ref, html);
  return (
    <div
      ref={ref}
      {...props}
      onClick={onEdit && (e => {
        if ((e.target as HTMLElement).closest('a, img')) return;
        onEdit(ref.current ? clickedCaret(ref.current, text) : null);
      })}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Rendered-text offset of a DOM position inside `root`. */
function renderedOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/**
 * Maps an offset in the rendered text to the raw markdown by walking both strings
 * and skipping markup characters (`**`, `[`, `](url)`, ...) that don't render.
 */
function rawOffset(raw: string, rendered: string, offset: number): number {
  if (raw === rendered) return offset;
  let i = 0;
  let j = 0;
  while (j < offset && i < raw.length) {
    if (raw[i] === rendered[j]) j++;
    i++;
  }
  // Land after any closing markup that hugs the clicked word (`**bold**|`).
  while (i < raw.length && /[*_~`]/.test(raw[i]) && rendered[j] !== raw[i]) i++;
  return i;
}

/** Where the click (or drag selection) in the rendered view falls in the raw markdown. */
function clickedCaret(root: HTMLElement, raw: string): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const rendered = root.textContent ?? '';
  const start = rawOffset(raw, rendered, renderedOffset(root, range.startContainer, range.startOffset));
  const end = sel.isCollapsed ? start : rawOffset(raw, rendered, renderedOffset(root, range.endContainer, range.endOffset));
  return [start, end];
}

function parseTableText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n');
  const headers = lines[0]?.split('|') ?? ['', ''];
  const colCount = headers.length;
  const dataLines = lines.slice(1).filter(Boolean);
  const rows = dataLines.map(l => {
    const cells = l.split('|');
    while (cells.length < colCount) cells.push('');
    return cells.slice(0, colCount);
  });
  return { headers, rows: rows.length > 0 ? rows : [Array(colCount).fill('')] };
}

function id() {
  return crypto.randomUUID();
}

function block(type: BlockType, text = ''): Block {
  return { id: id(), type, text };
}

export function parseMarkdownBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

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
      const firstContent = quote[1];
      // Detect callout: blockquote whose first word is an emoji
      const firstWord = firstContent.split(' ')[0];
      if (startsWithEmoji(firstWord)) {
        const emoji = firstWord;
        const firstLine = firstContent.slice(emoji.length).trimStart();
        const contentLines = [firstLine];
        while (i + 1 < lines.length) {
          const next = /^>\s?(.*)$/.exec(lines[i + 1]);
          if (!next) break;
          contentLines.push(next[1]);
          i += 1;
        }
        blocks.push(block('callout', emoji + '\n' + contentLines.join('\n')));
      } else {
        const quoteLines = [firstContent];
        while (i + 1 < lines.length) {
          const next = /^>\s?(.*)$/.exec(lines[i + 1]);
          if (!next) break;
          quoteLines.push(next[1]);
          i += 1;
        }
        blocks.push(block('quote', quoteLines.join('\n')));
      }
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push(block('bullet', bullet[1]));
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      blocks.push(block('numbered', numbered[1]));
      continue;
    }

    // Detect thematic breaks: ---, ***, ___
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      flushParagraph();
      blocks.push(block('divider'));
      continue;
    }

    // Detect JSX callout: <Callout type="…">…</Callout>
    const jsxCalloutOpen = /^<Callout\s+type="([^"]+)"\s*>/.exec(line);
    if (jsxCalloutOpen) {
      flushParagraph();
      const calloutType = jsxCalloutOpen[1];
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
      blocks.push(block('callout', `type:${calloutType}\n${contentLines.join('\n')}`));
      continue;
    }

    // Detect markdown pipe tables
    if (/^\|.+\|/.test(line.trim())) {
      flushParagraph();
      const tableLines = [line];
      while (i + 1 < lines.length && /^\|.+\|/.test(lines[i + 1].trim())) {
        i += 1;
        tableLines.push(lines[i]);
      }
      // Skip separator rows (e.g. | --- | --- |)
      const dataLines = tableLines.filter(l => !/^\|\s*[-: |]+\|\s*$/.test(l.trim()));
      const parsedRows = dataLines.map(l =>
        l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
      );
      if (parsedRows.length >= 1) {
        blocks.push(block('table', parsedRows.map(r => r.join('|')).join('\n')));
      }
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.length > 0 ? blocks : [block('paragraph')];
}

function serializeBlock(b: Block, index: number) {
  const text = b.text.trimEnd();
  if (b.type === 'callout') {
    const { emoji, content, jsxType } = calloutParts(text);
    if (!content.trim()) return '';
    if (jsxType) {
      return `<Callout type="${jsxType}">\n${content}\n</Callout>`;
    }
    return content.split('\n').map((line, i) =>
      i === 0 ? `> ${emoji} ${line}` : `> ${line}`
    ).join('\n');
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
    const headerRow = '| ' + padded[0].map(h => h || ' ').join(' | ') + ' |';
    const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
    const bodyRows = padded.slice(1).map(row => '| ' + row.map(c => c || ' ').join(' | ') + ' |');
    return [headerRow, separator, ...bodyRows].join('\n');
  }
  if (!text) return '';
  if (b.type === 'heading1') return `# ${text}`;
  if (b.type === 'heading2') return `## ${text}`;
  if (b.type === 'heading3') return `### ${text}`;
  if (b.type === 'quote') return text.split('\n').map(line => `> ${line}`).join('\n');
  if (b.type === 'bullet') return text.split('\n').map(line => `- ${line}`).join('\n');
  if (b.type === 'numbered') return text.split('\n').map((line, i) => `${index + 1 + i}. ${line}`).join('\n');
  if (b.type === 'code') {
    const { lang, code } = parseCodeText(text);
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }
  return text;
}

export function serializeMarkdownBlocks(blocks: Block[]) {
  const result: string[] = [];
  let numSeq = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const prev = blocks[i - 1];

    // Track consecutive numbered-list sequence
    if (b.type === 'numbered') {
      numSeq = prev?.type === 'numbered' ? numSeq + 1 : 1;
    } else {
      numSeq = 0;
    }

    const text = serializeBlock(b, b.type === 'numbered' ? numSeq - 1 : i);
    if (!text) continue;

    // Adjacent same-type list items join with a single newline (no blank line)
    const continuousWithPrev =
      (b.type === 'bullet'   && prev?.type === 'bullet') ||
      (b.type === 'numbered' && prev?.type === 'numbered');

    result.push(continuousWithPrev ? '\n' : result.length > 0 ? '\n\n' : '');
    result.push(text);
  }

  return result.join('');
}

function AutoTextarea({
  value,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  className,
  style,
  placeholder,
  dir = 'auto',
  blockId,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onFocus: () => void;
  onBlur?: () => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  dir?: 'auto' | 'ltr';
  blockId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Sized to the content before paint, with no extra minimum: the view mode div has the
  // same box, so switching between them doesn't change the block's height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, style?.fontSize, style?.lineHeight]);

  // Width changes (window or sidebar resize) re-wrap the text.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      dir={dir}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
      spellCheck={dir !== 'ltr'}
      data-block-input={blockId}
      style={{
        width: '100%',
        resize: 'none',
        overflow: 'hidden',
        background: 'transparent',
        border: 0,
        outline: 'none',
        color: 'var(--text)',
        ...style,
      }}
    />
  );
}

function blockLabel(type: BlockType) {
  return SLASH_ITEMS.find(item => item.type === type)?.label ?? 'Text';
}

function CalloutBlock({
  text,
  editorStyle,
  isEditing,
  blockId,
  onEnterEdit,
  onFocus,
  onBlur,
  onChange,
  onInsertAfter,
  onRemove,
}: {
  text: string;
  editorStyle: React.CSSProperties;
  isEditing: boolean;
  blockId: string;
  onEnterEdit: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (v: string) => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}) {
  const { emoji, content, jsxType } = calloutParts(text);
  const dir = detectDir(content);

  const cycleEmoji = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (jsxType) {
      const idx = CALLOUT_JSX_TYPES.indexOf(jsxType);
      const next = CALLOUT_JSX_TYPES[(idx + 1) % CALLOUT_JSX_TYPES.length];
      onChange(`type:${next}\n${content}`);
    } else {
      const idx = CALLOUT_EMOJI.indexOf(emoji);
      const next = CALLOUT_EMOJI[(idx + 1) % CALLOUT_EMOJI.length];
      onChange(next + '\n' + content);
    }
  };

  if (!isEditing) {
    return (
      <div
        className="callout-block"
        dir={dir}
        onClick={() => onEnterEdit()}
        role="button"
        tabIndex={0}
        style={{ cursor: 'text' }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnterEdit(); } }}
      >
        <span className="callout-emoji-btn" style={{ pointerEvents: 'none' }}>
          {emoji}
          {jsxType && <span className="callout-type-badge">{jsxType}</span>}
        </span>
        <InlineView
          text={content}
          fallback="&nbsp;"
          className="callout-text block-view"
          dir={dir}
          style={{ ...editorStyle, lineHeight: 1.6 }}
        />
      </div>
    );
  }

  return (
    <div className="callout-block" dir={dir}>
      <button
        type="button"
        className="callout-emoji-btn"
        onClick={cycleEmoji}
        onMouseDown={e => e.preventDefault()}
        title={jsxType ? `Type: ${jsxType} — click to change` : 'Click to change emoji'}
        aria-label="Change callout type"
      >
        {emoji}
        {jsxType && <span className="callout-type-badge">{jsxType}</span>}
      </button>
      <div className="callout-text">
        <AutoTextarea
          value={content}
          dir="auto"
          blockId={blockId}
          placeholder="Add a callout…"
          className="block-editor-input"
          style={{ ...editorStyle, lineHeight: 1.6 }}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={v => onChange(emoji + '\n' + v)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onInsertAfter();
            }
            if (e.key === 'Backspace' && content === '') {
              e.preventDefault();
              onRemove();
            }
          }}
        />
      </div>
    </div>
  );
}

function CodeBlock({
  text,
  onFocus,
  onChange,
  onInsertAfter,
  onRemove,
}: {
  text: string;
  onFocus: () => void;
  onChange: (v: string) => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}) {
  const { lang, code } = parseCodeText(text);
  const [copied, setCopied] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const highlighted = useMemo(() => {
    if (!code) return '';
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value; } catch { /* fallback */ }
    }
    return hljs.highlightAuto(code).value;
  }, [lang, code]);

  const update = (nextLang: string, nextCode: string) =>
    onChange(nextLang + '\n' + nextCode);

  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { onInsertAfter(); return; }
    if (e.key === 'Backspace' && code === '') { e.preventDefault(); onRemove(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, start) + '  ' + code.slice(end);
      update(lang, next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.65,
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <CustomSelect
          value={lang}
          options={LANG_OPTIONS}
          onChange={v => update(v, code)}
          variant="code"
          size="sm"
          menuMinWidth={170}
          ariaLabel="Language"
        />
        <button
          type="button"
          className="code-copy-btn"
          onClick={copy}
          tabIndex={-1}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-block-body">
        <pre
          className="code-highlight hljs"
          aria-hidden="true"
          style={monoStyle}
          dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
        />
        <textarea
          ref={taRef}
          value={code}
          onChange={e => update(lang, e.target.value)}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          className="code-block-textarea"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          style={monoStyle}
          placeholder="// code here…"
        />
      </div>
    </div>
  );
}

function TableBlock({
  text,
  editorStyle,
  isEditing,
  onEnterEdit,
  onBlur,
  onChange,
  onInsertAfter,
  onRemove,
}: {
  text: string;
  editorStyle: React.CSSProperties;
  isEditing: boolean;
  onEnterEdit: () => void;
  onBlur: () => void;
  onChange: (v: string) => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}) {
  const { headers, rows } = parseTableText(text);
  const tid = useRef(`t${crypto.randomUUID().slice(0, 8)}`).current;

  useEffect(() => {
    if (!isEditing) return;
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-tcell="${tid}-h-0"]`)?.focus();
    }, 0);
  }, [isEditing, tid]);

  const ser = (h: string[], r: string[][]) =>
    [h, ...r].map(row => row.join('|')).join('\n');

  const setCell = (isHeader: boolean, rowIdx: number, colIdx: number, value: string) => {
    if (isHeader) {
      const nh = [...headers]; nh[colIdx] = value;
      onChange(ser(nh, rows));
    } else {
      const nr = rows.map(r => [...r]); nr[rowIdx][colIdx] = value;
      onChange(ser(headers, nr));
    }
  };

  const focusCell = (rowIdx: number, colIdx: number) => {
    const key = rowIdx === -1 ? `${tid}-h-${colIdx}` : `${tid}-${rowIdx}-${colIdx}`;
    document.querySelector<HTMLInputElement>(`[data-tcell="${key}"]`)?.focus();
  };

  const addRow = () => {
    const newRows = [...rows, Array(headers.length).fill('')];
    onChange(ser(headers, newRows));
    const newIdx = rows.length;
    requestAnimationFrame(() => focusCell(newIdx, 0));
  };

  const addCol = () => {
    const nh = [...headers, ''];
    const nr = rows.map(r => [...r, '']);
    onChange(ser(nh, nr));
    requestAnimationFrame(() => focusCell(-1, headers.length));
  };

  const deleteRow = (rowIdx: number) => {
    if (rows.length <= 1) { onRemove(); return; }
    const nr = rows.filter((_, i) => i !== rowIdx);
    onChange(ser(headers, nr));
    requestAnimationFrame(() => focusCell(Math.max(0, rowIdx - 1), 0));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    const colCount = headers.length;
    const rowCount = rows.length;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey) {
        if (colIdx < colCount - 1) focusCell(rowIdx, colIdx + 1);
        else if (rowIdx === -1) rowCount > 0 ? focusCell(0, 0) : addRow();
        else if (rowIdx < rowCount - 1) focusCell(rowIdx + 1, 0);
        else addRow();
      } else {
        if (colIdx > 0) focusCell(rowIdx, colIdx - 1);
        else if (rowIdx === 0) focusCell(-1, colCount - 1);
        else if (rowIdx > 0) focusCell(rowIdx - 1, colCount - 1);
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (rowIdx === -1) { rowCount > 0 ? focusCell(0, colIdx) : addRow(); }
      else if (rowIdx < rowCount - 1) { focusCell(rowIdx + 1, colIdx); }
      else addRow();
    }
    if (e.key === 'Escape') onInsertAfter();
  };

  const inputStyle: React.CSSProperties = {
    fontSize: (editorStyle.fontSize as number) ?? 14,
    fontFamily: editorStyle.fontFamily ?? 'inherit',
  };

  if (!isEditing) {
    return (
      <div
        className="table-block-wrapper"
        onClick={onEnterEdit}
        role="button"
        tabIndex={0}
        style={{ cursor: 'text' }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnterEdit(); } }}
      >
        <div className="table-block-scroll">
          <table className="table-block">
            <thead>
              <tr>
                {headers.map((h, colIdx) => (
                  <th key={colIdx}>
                    <InlineView text={h} fallback="&nbsp;" className="table-cell-view" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="table-data-row">
                  {row.map((cell, colIdx) => (
                    <td key={colIdx}>
                      <InlineView text={cell} fallback="&nbsp;" className="table-cell-view" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div
      className="table-block-wrapper"
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onBlur();
      }}
    >
      <div className="table-block-scroll">
        <table className="table-block">
          <thead>
            <tr>
              {headers.map((h, colIdx) => (
                <th key={colIdx}>
                  <input
                    data-tcell={`${tid}-h-${colIdx}`}
                    value={h}
                    onChange={e => setCell(true, -1, colIdx, e.target.value)}
                    onKeyDown={e => handleKeyDown(e, -1, colIdx)}
                    placeholder="Header"
                    className="table-cell-input"
                    style={inputStyle}
                  />
                </th>
              ))}
              <th className="table-add-col-th">
                <button
                  type="button"
                  className="table-add-btn"
                  onClick={addCol}
                  tabIndex={-1}
                  title="Add column"
                  aria-label="Add column"
                >+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="table-data-row">
                {row.map((cell, colIdx) => (
                  <td key={colIdx}>
                    <input
                      data-tcell={`${tid}-${rowIdx}-${colIdx}`}
                      value={cell}
                      onChange={e => setCell(false, rowIdx, colIdx, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)}
                      placeholder=""
                      className="table-cell-input"
                      style={inputStyle}
                    />
                  </td>
                ))}
                <td className="table-row-actions">
                  <button
                    type="button"
                    className="table-row-delete-btn"
                    onClick={() => deleteRow(rowIdx)}
                    tabIndex={-1}
                    title="Delete row"
                    aria-label="Delete row"
                  >×</button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={headers.length + 1} className="table-add-row-cell">
                <button
                  type="button"
                  className="table-add-row-btn"
                  onClick={addRow}
                  tabIndex={-1}
                >+ Add row</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BlockEditor({ value, onChange, editorStyle, onInsertImage }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => parseMarkdownBlocks(value));
  const [slashFor, setSlashFor] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Gap the dragged block would land in: 0 = before the first block, blocks.length = after the last.
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  // Briefly highlights a block after it was dropped so the eye can follow it.
  const [justDropped, setJustDropped] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    if (!justDropped) return;
    const id = window.setTimeout(() => setJustDropped(null), 700);
    return () => window.clearTimeout(id);
  }, [justDropped]);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setBlocks(parseMarkdownBlocks(value));
  }, [value]);

  useEffect(() => {
    if (slashFor === null) return;
    document.querySelector<HTMLElement>(`[data-slash-idx="${slashIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [slashIndex, slashFor]);

  const emit = (next: Block[]) => {
    setBlocks(next);
    const markdown = serializeMarkdownBlocks(next);
    lastEmitted.current = markdown;
    onChange(markdown);
  };

  const updateBlock = (blockId: string, updates: Partial<Block>) => {
    const next = blocks.map(b => b.id === blockId ? { ...b, ...updates } : b);
    emit(next);
  };

  const images = useEditorImages();
  // Image blocks open the viewer; without the images context they fall back to editing.
  const openImage = (blockId: string, alt: string, src: string, edit: () => void) => {
    if (!images) { edit(); return; }
    images.openViewer({
      src,
      alt,
      onEdit: edit,
      onReplaceSrc: next => updateBlock(blockId, { text: `![${alt}](${next})` }),
    });
  };

  const insertAfter = (blockId: string, nextBlock = block('paragraph')) => {
    const idx = blocks.findIndex(b => b.id === blockId);
    const next = [...blocks.slice(0, idx + 1), nextBlock, ...blocks.slice(idx + 1)];
    emit(next);
    setFocusedId(nextBlock.id);
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>(`[data-block-input="${nextBlock.id}"]`)?.focus();
    }, 0);
  };

  const removeBlock = (blockId: string) => {
    if (blocks.length === 1) {
      emit([block('paragraph')]);
      return;
    }
    const idx = blocks.findIndex(b => b.id === blockId);
    const next = blocks.filter(b => b.id !== blockId);
    emit(next);
    const focusId = next[Math.max(0, idx - 1)]?.id;
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>(`[data-block-input="${focusId}"]`)?.focus();
    }, 0);
  };

  const TEXT_TYPES: BlockType[] = ['paragraph', 'heading1', 'heading2', 'heading3', 'quote', 'bullet', 'numbered'];

  const focusBlock = (blockId: string) => {
    window.setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`[data-block-input="${blockId}"]`);
      if (!el) return;
      el.focus();
      if ('selectionStart' in el) el.selectionStart = el.selectionEnd = el.value.length;
    }, 0);
  };

  // Keeps the block's text (minus a `/command` being typed); callouts drop their emoji line.
  const convertBlock = async (blockId: string, type: BlockType) => {
    const current = blocks.find(b => b.id === blockId);
    setSlashFor(null);
    if (!current) return;
    const raw = slashQuery(current.text) !== null ? '' : current.text;
    const existing = current.type === 'callout' ? calloutParts(raw).content : raw;
    if (current.type === type && raw === current.text) return;
    if (type === 'callout') {
      updateBlock(blockId, { type, text: `💡\n${existing}` });
    } else if (type === 'table') {
      updateBlock(blockId, { type, text: 'Column 1|Column 2\n|' });
    } else if (type === 'divider') {
      updateBlock(blockId, { type, text: '' });
    } else {
      updateBlock(blockId, { type, text: existing });
    }
    if (TEXT_TYPES.includes(type)) { setFocusedId(blockId); focusBlock(blockId); }
    else setFocusedId(null);
  };

  const runSlashItem = (blockId: string, item: SlashItem) => {
    if (item.type === 'image') void insertImageBlock(blockId);
    else void convertBlock(blockId, item.type);
  };

  const slashItems = useMemo(
    () => SLASH_ITEMS.filter(item => item.type !== 'image' || onInsertImage),
    [onInsertImage],
  );

  const [menu, setMenu] = useState<{ blockId: string; x: number; y: number } | null>(null);

  // Opens the block menu under a button; `align` says which edge of the button it lines up with.
  const MENU_WIDTH = 240;
  // The menu closes on any outside mousedown, which includes its own trigger; without this
  // a second click on ⋯ would close and immediately reopen it.
  const lastClosed = useRef<{ blockId: string; at: number } | null>(null);
  const closeMenu = () => {
    if (menu) lastClosed.current = { blockId: menu.blockId, at: Date.now() };
    setMenu(null);
  };
  const openMenuAt = (blockId: string, button: HTMLElement, align: 'start' | 'end') => {
    const closed = lastClosed.current;
    if (closed?.blockId === blockId && Date.now() - closed.at < 400) { lastClosed.current = null; return; }
    if (menu?.blockId === blockId) { closeMenu(); return; }
    const r = button.getBoundingClientRect();
    const rtl = document.documentElement.dir === 'rtl';
    const alignRight = (align === 'end') !== rtl;
    setSlashFor(null);
    setMenu({ blockId, x: alignRight ? r.right - MENU_WIDTH : r.left, y: r.bottom + 4 });
  };

  const duplicateBlock = (blockId: string) => {
    const source = blocks.find(b => b.id === blockId);
    if (source) insertAfter(blockId, block(source.type, source.text));
  };

  const insertImageBlock = async (blockId: string) => {
    if (!onInsertImage) return;
    const url = await onInsertImage();
    if (!url) return;
    const name = url.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'image';
    updateBlock(blockId, { type: 'paragraph', text: `![${name}](${url})` });
    setSlashFor(null);
  };

  /** Moves a block so it lands at `slot` (an index between blocks, 0..length). */
  const moveBlock = (blockId: string, slot: number) => {
    const from = blocks.findIndex(b => b.id === blockId);
    if (from === -1 || slot === from || slot === from + 1) return;
    const moving = blocks[from];
    const without = blocks.filter(b => b.id !== blockId);
    const at = slot > from ? slot - 1 : slot;
    emit([...without.slice(0, at), moving, ...without.slice(at)]);
    setJustDropped(blockId);
  };

  // Nearest gap to the pointer: before the first row whose middle is below it, else after the last.
  // The drop preview sits in the flow and pushes rows down, so hovering it keeps the current slot;
  // without that, the preview moving would move the rows and flip the slot back and forth.
  const dropSlotAt = (clientY: number): number => {
    const preview = rootRef.current?.querySelector<HTMLElement>('[data-drop-preview]');
    if (preview && dropSlot !== null) {
      const p = preview.getBoundingClientRect();
      if (clientY >= p.top && clientY <= p.bottom) return dropSlot;
    }
    const rows = rootRef.current?.querySelectorAll<HTMLElement>('[data-block-row]') ?? [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return rows.length;
  };

  // While dragging near the top or bottom of the editor pane, scroll it (faster closer to the edge).
  const autoScroll = (clientY: number) => {
    const pane = rootRef.current?.closest<HTMLElement>('.editor-scroll');
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    const edge = 72;
    if (clientY < r.top + edge) pane.scrollTop -= Math.ceil((r.top + edge - clientY) / 4);
    else if (clientY > r.bottom - edge) pane.scrollTop += Math.ceil((clientY - (r.bottom - edge)) / 4);
  };

  const dragActive = useRef(false);
  const endDrag = () => { dragActive.current = false; setDraggingId(null); setDropSlot(null); };

  // A small floating card under the cursor instead of the browser's translucent screenshot.
  const startDrag = (e: React.DragEvent, b: Block) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(BLOCK_MIME, b.id);
    // The padded outer box leaves room for the card's shadow (drag images clip to the element).
    const ghost = document.createElement('div');
    ghost.className = 'block-drag-ghost';
    const card = document.createElement('div');
    card.className = 'block-drag-ghost-card';
    ghost.appendChild(card);
    const label = document.createElement('span');
    label.className = 'block-drag-ghost-type';
    label.textContent = blockLabel(b.type);
    const text = document.createElement('span');
    text.className = `block-drag-ghost-text${b.type.startsWith('heading') ? ' heading' : ''}`;
    const plain = b.type === 'callout' ? calloutParts(b.text).content : b.text;
    text.textContent = /^!\[/.test(plain.trim()) ? 'Image' : plain.replace(/\s+/g, ' ').trim().slice(0, 90) || 'Empty block';
    card.append(label, text);
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 30, 30);
    // The browser snapshots the drag image synchronously; the element can go right away.
    window.setTimeout(() => ghost.remove(), 0);
    // Restyling the source inside dragstart can cancel the drag in Chromium; wait a frame.
    dragActive.current = true;
    requestAnimationFrame(() => {
      // A very short drag can end before this frame.
      if (!dragActive.current) return;
      setDraggingId(b.id);
      setSlashFor(null);
      setMenu(null);
    });
  };

  const dragFrom = draggingId ? blocks.findIndex(b => b.id === draggingId) : -1;
  // Dropping right next to itself changes nothing, so no preview there.
  const activeSlot = dropSlot !== null && dropSlot !== dragFrom && dropSlot !== dragFrom + 1 ? dropSlot : null;
  const dragged = dragFrom >= 0 ? blocks[dragFrom] : null;
  const dropPreview = dragged && activeSlot !== null
    ? <DropPreview key={`drop-${activeSlot}`} block={dragged} editorStyle={editorStyle} />
    : null;

  return (
    <div
      ref={rootRef}
      className={`block-editor${draggingId ? ' is-dragging' : ''}`}
      style={editorStyle}
      onDragOver={e => {
        if (!draggingId || !e.dataTransfer.types.includes(BLOCK_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        autoScroll(e.clientY);
        const slot = dropSlotAt(e.clientY);
        if (slot !== dropSlot) setDropSlot(slot);
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropSlot(null);
      }}
      onDrop={e => {
        if (!draggingId || !e.dataTransfer.types.includes(BLOCK_MIME)) return;
        e.preventDefault();
        // Drop where the preview shows, even if the pointer is over the preview itself.
        moveBlock(draggingId, dropSlot ?? dropSlotAt(e.clientY));
        endDrag();
      }}
    >
      {blocks.map((b, index) => {
        const query = slashFor === b.id ? slashQuery(b.text) : null;
        const slashOpen = query !== null;
        const matches = slashOpen ? filterSlashItems(slashItems, query) : [];
        const textStyle = blockTextStyle(b.type, editorStyle);
        const imgMatch = b.type === 'paragraph'
          ? /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(b.text.trim())
          : null;
        const isEditing = focusedId === b.id || b.text.trim() === '';
        // `caret` comes from the click in view mode; without it the caret goes to the end.
        const enterEditMode = (caret?: [number, number] | null) => {
          setFocusedId(b.id);
          window.setTimeout(() => {
            const el = document.querySelector<HTMLTextAreaElement>(`[data-block-input="${b.id}"]`);
            if (!el) return;
            el.focus({ preventScroll: true });
            const len = el.value.length;
            const [start, end] = caret ?? [len, len];
            el.setSelectionRange(Math.min(start, len), Math.min(end, len));
          }, 0);
        };
        const line = firstLine(b.type, textStyle);
        return (
          <Fragment key={b.id}>
          {activeSlot === index && dropPreview}
          <div
            data-block-row={b.id}
            className={`block-editor-row${draggingId === b.id ? ' dragging' : ''}${justDropped === b.id ? ' just-dropped' : ''}${menu?.blockId === b.id ? ' menu-open' : ''}`}
            // Side buttons and list markers centre on the first line (see firstLine).
            style={{ '--line-top': `${line.top}px`, '--line-h': `${line.height}px` } as React.CSSProperties}
            // Shift+right-click keeps the native menu (copy / paste).
            onContextMenu={e => {
              if (e.shiftKey) return;
              e.preventDefault();
              setSlashFor(null);
              setMenu({ blockId: b.id, x: e.clientX, y: e.clientY });
            }}
          >
            <div className="block-editor-controls">
              <button
                type="button"
                draggable
                onDragStart={e => startDrag(e, b)}
                onDragEnd={endDrag}
                onKeyDown={e => {
                  // Keyboard reordering: focus the handle, then Arrow Up / Down.
                  if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); moveBlock(b.id, index - 1); }
                  if (e.key === 'ArrowDown' && index < blocks.length - 1) { e.preventDefault(); moveBlock(b.id, index + 2); }
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-block-row="${b.id}"] .block-editor-handle`)?.focus(), 0);
                  }
                }}
                // A click without dragging opens the block menu (drag never fires click).
                onClick={e => openMenuAt(b.id, e.currentTarget, 'start')}
                className="block-editor-handle"
                title="Drag to move · Click for options"
                aria-label="Drag block, or click for options"
                aria-haspopup="menu"
              >
                <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                  <circle cx="3"  cy="3"  r="1.4" />
                  <circle cx="7"  cy="3"  r="1.4" />
                  <circle cx="3"  cy="8"  r="1.4" />
                  <circle cx="7"  cy="8"  r="1.4" />
                  <circle cx="3"  cy="13" r="1.4" />
                  <circle cx="7"  cy="13" r="1.4" />
                </svg>
              </button>
            </div>

            <div className="block-editor-content">
              {b.type === 'callout' ? (
                <CalloutBlock
                  text={b.text}
                  editorStyle={editorStyle}
                  isEditing={focusedId === b.id || b.text.trim() === ''}
                  blockId={b.id}
                  onEnterEdit={() => enterEditMode()}
                  onFocus={() => { setFocusedId(b.id); setSlashFor(null); }}
                  onBlur={() => setFocusedId(null)}
                  onChange={v => updateBlock(b.id, { text: v })}
                  onInsertAfter={() => insertAfter(b.id)}
                  onRemove={() => removeBlock(b.id)}
                />
              ) : b.type === 'divider' ? (
                <div
                  className="divider-block"
                  tabIndex={0}
                  role="separator"
                  data-block-input={b.id}
                  onFocus={() => setSlashFor(null)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); insertAfter(b.id); }
                    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeBlock(b.id); }
                  }}
                >
                  <hr className="divider-line" />
                </div>
              ) : b.type === 'table' ? (
                <TableBlock
                  text={b.text}
                  editorStyle={editorStyle}
                  isEditing={focusedId === b.id || b.text.trim() === ''}
                  onEnterEdit={() => setFocusedId(b.id)}
                  onBlur={() => setFocusedId(null)}
                  onChange={v => updateBlock(b.id, { text: v })}
                  onInsertAfter={() => insertAfter(b.id)}
                  onRemove={() => removeBlock(b.id)}
                />
              ) : b.type === 'code' ? (
                <CodeBlock
                  text={b.text}
                  onFocus={() => setSlashFor(null)}
                  onChange={v => updateBlock(b.id, { text: v })}
                  onInsertAfter={() => insertAfter(b.id)}
                  onRemove={() => removeBlock(b.id)}
                />
              ) : imgMatch && !isEditing ? (
                <div
                  className="image-block"
                  tabIndex={0}
                  data-block-input={b.id}
                  onClick={() => openImage(b.id, imgMatch[1], imgMatch[2], enterEditMode)}
                  onDoubleClick={() => enterEditMode()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); insertAfter(b.id); }
                    if (e.key === ' ') { e.preventDefault(); openImage(b.id, imgMatch[1], imgMatch[2], enterEditMode); }
                    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeBlock(b.id); }
                  }}
                >
                  <ResolvedImg
                    src={imgMatch[2]}
                    alt={imgMatch[1]}
                    className="image-block-img"
                    onOpen={() => openImage(b.id, imgMatch[1], imgMatch[2], enterEditMode)}
                  />
                </div>
              ) : !isEditing ? (
                <InlineView
                  text={b.text}
                  fallback={' '}
                  className={`block-editor-input block-${b.type} block-view`}
                  style={textStyle}
                  onEdit={enterEditMode}
                />
              ) : (
                <AutoTextarea
                  value={b.text}
                  dir='auto'
                  blockId={b.id}
                  placeholder={index === 0 ? 'Type / for commands' : ''}
                  className={`block-editor-input block-${b.type}`}
                  style={textStyle}
                  onFocus={() => {
                    setFocusedId(b.id);
                    setSlashFor(slashQuery(b.text) !== null ? b.id : null);
                  }}
                  onBlur={() => { setFocusedId(null); setSlashFor(null); }}
                  onChange={nextText => {
                    updateBlock(b.id, { text: nextText });
                    // Every keystroke re-filters, so the first match is selected again.
                    setSlashIndex(0);
                    setSlashFor(slashQuery(nextText) !== null ? b.id : null);
                  }}
                  onKeyDown={e => {
                    if (slashOpen && matches.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashIndex(i => (i + 1) % matches.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashIndex(i => (i - 1 + matches.length) % matches.length);
                        return;
                      }
                      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                        e.preventDefault();
                        runSlashItem(b.id, matches[Math.min(slashIndex, matches.length - 1)]);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      insertAfter(b.id);
                    }
                    if (e.key === 'Backspace' && b.text === '') {
                      e.preventDefault();
                      removeBlock(b.id);
                    }
                    if (e.key === 'Escape') setSlashFor(null);
                  }}
                />
              )}
              <div className="block-editor-type">{blockLabel(b.type)}</div>

              {slashOpen && (
                <div className="slash-menu mac-dropdown" role="listbox" aria-label="Insert block">
                  {matches.length === 0 ? (
                    <div className="slash-empty">No blocks match “{query}”</div>
                  ) : matches.map((item, idx) => (
                    <button
                      key={item.type}
                      type="button"
                      role="option"
                      aria-selected={slashIndex === idx}
                      data-slash-idx={idx}
                      className={slashIndex === idx ? 'active' : ''}
                      onMouseEnter={() => setSlashIndex(idx)}
                      onMouseDown={e => {
                        e.preventDefault();
                        runSlashItem(b.id, item);
                      }}
                    >
                      <span className="slash-marker">{item.marker}</span>
                      <span className="slash-copy">
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="block-editor-end">
              <button
                type="button"
                className="block-editor-more"
                onMouseDown={e => e.preventDefault()}
                onClick={e => openMenuAt(b.id, e.currentTarget, 'end')}
                title="Block options"
                aria-label="Block options"
                aria-haspopup="menu"
                aria-expanded={menu?.blockId === b.id}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </div>
          </div>
          {index === blocks.length - 1 && activeSlot === blocks.length && dropPreview}
          </Fragment>
        );
      })}
      {menu && (() => {
        const target = blocks.find(b => b.id === menu.blockId);
        if (!target) return null;
        return (
          <BlockContextMenu
            x={menu.x}
            y={menu.y}
            type={target.type}
            onClose={closeMenu}
            onTurnInto={type => { setMenu(null); void convertBlock(target.id, type); }}
            onInsertBelow={() => { setMenu(null); insertAfter(target.id); }}
            onDuplicate={() => { setMenu(null); duplicateBlock(target.id); }}
            onDelete={() => { setMenu(null); removeBlock(target.id); }}
          />
        );
      })()}
    </div>
  );
}

/* ─── Drop preview: the dragged block, shown where it will land ──────── */

/**
 * A read-only copy of the dragged block in the gap it would drop into. It uses the row
 * layout (side columns + content) so it lines up exactly with the real block.
 */
function DropPreview({ block: b, editorStyle }: { block: Block; editorStyle: React.CSSProperties }) {
  const textStyle = blockTextStyle(b.type, editorStyle);
  const line = firstLine(b.type, textStyle);
  const img = b.type === 'paragraph' ? /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(b.text.trim()) : null;

  let content: React.ReactNode;
  if (img) {
    content = <ResolvedImg src={img[2]} alt={img[1]} className="image-block-img drop-preview-img" />;
  } else if (b.type === 'divider') {
    content = <div className="divider-block"><hr className="divider-line" /></div>;
  } else if (b.type === 'code') {
    content = <pre className="drop-preview-code">{b.text.split('\n').slice(0, 8).join('\n') || ' '}</pre>;
  } else if (b.type === 'table') {
    const { headers, rows } = parseTableText(b.text);
    content = (
      <div className="drop-preview-table">
        {headers.map((h, i) => <span key={i}>{h || ' '}</span>)}
        <small>{rows.length} {rows.length === 1 ? 'row' : 'rows'}</small>
      </div>
    );
  } else if (b.type === 'callout') {
    const { emoji, content: text } = calloutParts(b.text);
    content = (
      <div className="callout-block">
        <span className="callout-emoji-btn">{emoji}</span>
        <InlineView text={text} fallback="&nbsp;" className="callout-text block-view" style={{ ...editorStyle, lineHeight: 1.6 }} />
      </div>
    );
  } else {
    content = (
      <InlineView
        text={b.text}
        fallback="&nbsp;"
        className={`block-editor-input block-${b.type} block-view`}
        style={textStyle}
      />
    );
  }

  return (
    <div
      className="block-drop-preview"
      data-drop-preview
      aria-hidden="true"
      style={{ '--line-top': `${line.top}px`, '--line-h': `${line.height}px` } as React.CSSProperties}
    >
      <div className="block-editor-controls" />
      <div className="block-editor-content">{content}</div>
      <div className="block-editor-end" />
    </div>
  );
}

/* ─── Right-click menu: turn a block into another type ───────────────── */

function BlockContextMenu({ x, y, type, onClose, onTurnInto, onInsertBelow, onDuplicate, onDelete }: {
  x: number;
  y: number;
  type: BlockType;
  onClose: () => void;
  onTurnInto: (type: BlockType) => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);

  // Tables and dividers have no text to carry over, so they only get the block actions.
  const convertible = TURN_INTO.includes(type);
  const turnInto = convertible
    ? filterSlashItems(SLASH_ITEMS.filter(i => (TURN_INTO as string[]).includes(i.type)), filter)
    : [];
  const actions = [
    { id: 'insert', label: 'Insert block below', marker: '+', run: onInsertBelow },
    { id: 'duplicate', label: 'Duplicate', marker: '⧉', run: onDuplicate },
    { id: 'delete', label: 'Delete', marker: '⌫', run: onDelete, danger: true },
  ].filter(a => !filter || a.label.toLowerCase().includes(filter.toLowerCase()));
  const total = turnInto.length + actions.length;
  const run = (idx: number) => {
    if (idx < turnInto.length) onTurnInto(turnInto[idx].type as BlockType);
    else actions[idx - turnInto.length]?.run();
  };

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const close = () => onClose();
    window.addEventListener('mousedown', away);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    // Capture: the editor scrolls inside its own pane, not the window. The menu's own list may scroll.
    document.addEventListener('scroll', away, true);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      document.removeEventListener('scroll', away, true);
    };
  }, [onClose]);

  useEffect(() => { setActive(0); }, [filter]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-menu-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return createPortal(
    <div
      ref={ref}
      className="slash-menu block-context-menu mac-dropdown"
      role="menu"
      aria-label="Block options"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        if (total === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % total); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + total) % total); }
        if (e.key === 'Enter') { e.preventDefault(); run(active); }
      }}
    >
      <input
        autoFocus
        className="block-context-filter"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder={convertible ? 'Turn into…' : 'Search actions…'}
        aria-label="Filter options"
      />
      {turnInto.length > 0 && <div className="block-context-label">Turn into</div>}
      {turnInto.map((item, idx) => (
        <button
          key={item.type}
          type="button"
          role="menuitemradio"
          aria-checked={item.type === type}
          data-menu-idx={idx}
          className={active === idx ? 'active' : ''}
          onMouseEnter={() => setActive(idx)}
          onClick={() => run(idx)}
        >
          <span className="slash-marker">{item.marker}</span>
          <span className="slash-copy"><strong>{item.label}</strong></span>
          {item.type === type && <span className="block-context-check" aria-hidden="true">✓</span>}
        </button>
      ))}
      {actions.length > 0 && <div className="block-context-sep" role="separator" />}
      {actions.map((a, i) => {
        const idx = turnInto.length + i;
        return (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            data-menu-idx={idx}
            className={`${active === idx ? 'active' : ''}${a.danger ? ' danger' : ''}`}
            onMouseEnter={() => setActive(idx)}
            onClick={() => run(idx)}
          >
            <span className="slash-marker">{a.marker}</span>
            <span className="slash-copy"><strong>{a.label}</strong></span>
          </button>
        );
      })}
      {total === 0 && <div className="slash-empty">Nothing matches “{filter}”</div>}
      <div className="block-context-hint">Shift + right-click for copy / paste</div>
    </div>,
    document.body,
  );
}

const toPx = (v: string | number | undefined, fallback: number) => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Where a block's first line sits inside its row, so the side buttons can centre on it:
 * `top` is the space above that line, `height` its line box. Values follow the block CSS
 * (content padding 4px, quote 8px + border, callout 12px + border + 3px, ...).
 */
function firstLine(type: BlockType, textStyle: React.CSSProperties): { top: number; height: number } {
  const size = toPx(textStyle.fontSize, 15);
  const lh = textStyle.lineHeight;
  // Unitless line height is a multiple of the font size; '28px' is absolute.
  const line = typeof lh === 'string' && lh.endsWith('px') ? toPx(lh, size * 1.6) : size * toPx(lh, 1.6);
  switch (type) {
    case 'quote':   return { top: 4 + 9, height: line };
    case 'callout': return { top: 4 + 16, height: size * 1.6 };
    case 'code':    return { top: 4 + 1, height: 30 };   // language header row
    case 'table':   return { top: 4 + 3, height: 36 };   // header cells
    case 'divider': return { top: 4, height: 22 };       // the rule, centred in its padding
    default:        return { top: 4, height: line };
  }
}

function blockTextStyle(type: BlockType, editorStyle: React.CSSProperties): React.CSSProperties {
  const base: React.CSSProperties = {
    ...editorStyle,
    unicodeBidi: type === 'code' ? 'embed' : 'plaintext',
    textAlign: 'start',
  };

  if (type === 'heading1') return { ...base, fontSize: 30, fontWeight: 700, lineHeight: 1.25 };
  if (type === 'heading2') return { ...base, fontSize: 23, fontWeight: 650, lineHeight: 1.3 };
  if (type === 'heading3') return { ...base, fontSize: 18, fontWeight: 650, lineHeight: 1.35 };
  if (type === 'code') {
    return {
      ...base,
      fontFamily: "ui-monospace, 'SFMono-Regular', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.65,
      direction: 'ltr',
      textAlign: 'left',
    };
  }
  return base;
}
