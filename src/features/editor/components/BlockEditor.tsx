import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
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
  type: BlockType;
  label: string;
  hint: string;
  marker: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  editorStyle: React.CSSProperties;
  onInsertImage?: () => Promise<string | null>;
}

const SLASH_ITEMS: SlashItem[] = [
  { type: 'paragraph', label: 'Text',         hint: 'Plain paragraph',         marker: 'T'   },
  { type: 'heading1',  label: 'Heading 1',    hint: 'Large section title',     marker: 'H1'  },
  { type: 'heading2',  label: 'Heading 2',    hint: 'Medium section title',    marker: 'H2'  },
  { type: 'heading3',  label: 'Heading 3',    hint: 'Small section title',     marker: 'H3'  },
  { type: 'bullet',    label: 'Bullet list',  hint: 'Simple unordered item',   marker: '•'   },
  { type: 'numbered',  label: 'Numbered list',hint: 'Ordered item',            marker: '1.'  },
  { type: 'quote',     label: 'Quote',        hint: 'Call out quoted text',    marker: '"'   },
  { type: 'callout',   label: 'Callout',      hint: 'Highlighted note or tip', marker: '💡'  },
  { type: 'table',     label: 'Table',        hint: 'Insert a structured table', marker: 'tbl' },
  { type: 'divider',   label: 'Divider',      hint: 'Horizontal separator line', marker: '—'   },
  { type: 'code',      label: 'Code',         hint: 'Always left-to-right',    marker: '</>' },
];

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
    tok(`<img src="${src}" alt="${esc(alt)}" class="inline-img" />`));
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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(30, el.scrollHeight)}px`;
  }, [value, style?.fontSize, style?.lineHeight]);

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
        onClick={onEnterEdit}
        role="button"
        tabIndex={0}
        style={{ cursor: 'text' }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnterEdit(); } }}
      >
        <span className="callout-emoji-btn" style={{ pointerEvents: 'none' }}>
          {emoji}
          {jsxType && <span className="callout-type-badge">{jsxType}</span>}
        </span>
        <div
          className="callout-text block-view"
          dir={dir}
          style={{ ...editorStyle, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: renderInline(content) || '&nbsp;' }}
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
        <select
          value={lang}
          onChange={e => update(e.target.value, code)}
          className="code-lang-select"
          tabIndex={-1}
        >
          {LANG_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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
                    <div
                      className="table-cell-view"
                      dangerouslySetInnerHTML={{ __html: renderInline(h) || '&nbsp;' }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="table-data-row">
                  {row.map((cell, colIdx) => (
                    <td key={colIdx}>
                      <div
                        className="table-cell-view"
                        dangerouslySetInnerHTML={{ __html: renderInline(cell) || '&nbsp;' }}
                      />
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
  const [focusedId, setFocusedId] = useState<string | null>(null);
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

  const convertBlock = async (blockId: string, type: BlockType) => {
    const existing = blocks.find(b => b.id === blockId)?.text.replace(/^\/$/, '') ?? '';
    if (type === 'paragraph') {
      updateBlock(blockId, { type, text: '' });
    } else if (type === 'callout') {
      updateBlock(blockId, { type, text: `💡\n${existing}` });
    } else if (type === 'table') {
      updateBlock(blockId, { type, text: 'Column 1|Column 2\n|' });
    } else {
      updateBlock(blockId, { type, text: existing });
    }
    setSlashFor(null);
    if (TEXT_TYPES.includes(type)) setFocusedId(blockId);
    else setFocusedId(null);
  };

  const insertImageBlock = async (blockId: string) => {
    if (!onInsertImage) return;
    const url = await onInsertImage();
    if (!url) return;
    const name = url.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'image';
    updateBlock(blockId, { type: 'paragraph', text: `![${name}](${url})` });
    setSlashFor(null);
  };

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const moving = blocks.find(b => b.id === draggingId);
    if (!moving) return;
    const without = blocks.filter(b => b.id !== draggingId);
    const targetIndex = without.findIndex(b => b.id === targetId);
    emit([...without.slice(0, targetIndex), moving, ...without.slice(targetIndex)]);
    setDraggingId(null);
  };

  return (
    <div
      className="block-editor"
      style={editorStyle}
    >
      {blocks.map((b, index) => {
        const slashOpen = slashFor === b.id;
        const textStyle = blockTextStyle(b.type, editorStyle);
        const imgMatch = b.type === 'paragraph'
          ? /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(b.text.trim())
          : null;
        const isEditing = focusedId === b.id || b.text.trim() === '';
        const enterEditMode = () => {
          setFocusedId(b.id);
          window.setTimeout(() => {
            document.querySelector<HTMLTextAreaElement>(`[data-block-input="${b.id}"]`)?.focus();
          }, 0);
        };
        return (
          <div
            key={b.id}
            className={`block-editor-row${draggingId === b.id ? ' dragging' : ''}`}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(b.id)}
          >
            <div className="block-editor-controls">
              <button
                type="button"
                draggable
                onDragStart={() => setDraggingId(b.id)}
                onDragEnd={() => setDraggingId(null)}
                className="block-editor-handle"
                title="Drag block"
                aria-label="Drag block"
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
                  onEnterEdit={enterEditMode}
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
                  onClick={enterEditMode}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); insertAfter(b.id); }
                    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeBlock(b.id); }
                  }}
                >
                  <img src={imgMatch[2]} alt={imgMatch[1]} className="image-block-img" />
                </div>
              ) : !isEditing ? (
                <div
                  className={`block-editor-input block-${b.type} block-view`}
                  style={textStyle}
                  onClick={enterEditMode}
                  dangerouslySetInnerHTML={{ __html: renderInline(b.text) || ' ' }}
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
                    setSlashFor(b.text.trim() === '/' ? b.id : null);
                  }}
                  onBlur={() => setFocusedId(null)}
                  onChange={nextText => {
                    updateBlock(b.id, { text: nextText });
                    if (nextText.trim() === '/') {
                      setSlashFor(b.id);
                      setSlashIndex(0);
                    } else {
                      setSlashFor(null);
                    }
                  }}
                  onKeyDown={e => {
                    if (slashOpen) {
                      const total = SLASH_ITEMS.length + (onInsertImage ? 1 : 0);
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashIndex(i => Math.min(i + 1, total - 1));
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashIndex(i => Math.max(i - 1, 0));
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (slashIndex < SLASH_ITEMS.length) {
                          void convertBlock(b.id, SLASH_ITEMS[slashIndex].type);
                        } else if (onInsertImage) {
                          void insertImageBlock(b.id);
                        }
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
                <div className="slash-menu mac-dropdown">
                  {SLASH_ITEMS.map((item, idx) => (
                    <button
                      key={item.type}
                      type="button"
                      data-slash-idx={idx}
                      className={slashIndex === idx ? 'active' : ''}
                      onMouseEnter={() => setSlashIndex(idx)}
                      onMouseDown={e => {
                        e.preventDefault();
                        void convertBlock(b.id, item.type);
                      }}
                    >
                      <span className="slash-marker">{item.marker}</span>
                      <span className="slash-copy">
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                    </button>
                  ))}
                  {onInsertImage && (
                    <button
                      type="button"
                      data-slash-idx={SLASH_ITEMS.length}
                      className={slashIndex === SLASH_ITEMS.length ? 'active' : ''}
                      onMouseEnter={() => setSlashIndex(SLASH_ITEMS.length)}
                      onMouseDown={e => {
                        e.preventDefault();
                        void insertImageBlock(b.id);
                      }}
                    >
                      <span className="slash-marker">img</span>
                      <span className="slash-copy">
                        <strong>Image</strong>
                        <small>Upload and insert markdown image</small>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
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
