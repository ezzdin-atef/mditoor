import { useState } from 'react';
import type { RefObject } from 'react';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  body: string;
  setBody: (v: string) => void;
  dir: 'ltr' | 'rtl' | 'auto';
  onDirChange: (d: 'ltr' | 'rtl' | 'auto') => void;
  onInsertImage?: () => Promise<void>;
}

interface ToolbarBtn {
  label: string;
  title: string;
  action: (ta: HTMLTextAreaElement, body: string, setBody: (v: string) => void) => void;
}

/* ── helpers ─────────────────────────────────────────────── */

function inline(before: string, after = before, placeholder = 'text'): ToolbarBtn['action'] {
  return (ta, body, setBody) => {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = body.slice(s, e) || placeholder;
    setBody(body.slice(0, s) + before + sel + after + body.slice(e));
    requestAnimationFrame(() => {
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
      ta.focus();
    });
  };
}

function linePrefix(prefix: string): ToolbarBtn['action'] {
  return (ta, body, setBody) => {
    const s = ta.selectionStart;
    const ls = body.lastIndexOf('\n', s - 1) + 1;
    const line = body.slice(ls);
    if (line.startsWith(prefix)) {
      const next = body.slice(0, ls) + body.slice(ls + prefix.length);
      setBody(next);
      requestAnimationFrame(() => {
        ta.setSelectionRange(Math.max(ls, s - prefix.length), Math.max(ls, s - prefix.length));
        ta.focus();
      });
    } else {
      setBody(body.slice(0, ls) + prefix + body.slice(ls));
      requestAnimationFrame(() => {
        ta.setSelectionRange(s + prefix.length, s + prefix.length);
        ta.focus();
      });
    }
  };
}

function insert(text: string, cursorOffset?: number): ToolbarBtn['action'] {
  return (ta, body, setBody) => {
    const s = ta.selectionStart;
    setBody(body.slice(0, s) + text + body.slice(s));
    const pos = s + (cursorOffset ?? text.length);
    requestAnimationFrame(() => {
      ta.setSelectionRange(pos, pos);
      ta.focus();
    });
  };
}

function bidiWrap(ltr: boolean): ToolbarBtn['action'] {
  return (ta, body, setBody) => {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    if (s === e) {
      const mark = ltr ? '‎' : '‏';
      setBody(body.slice(0, s) + mark + body.slice(s));
      requestAnimationFrame(() => { ta.setSelectionRange(s + 1, s + 1); ta.focus(); });
    } else {
      const open = ltr ? '⁦' : '⁧';
      const sel  = body.slice(s, e);
      const next = body.slice(0, s) + open + sel + '⁩' + body.slice(e);
      setBody(next);
      requestAnimationFrame(() => { ta.setSelectionRange(s + 1, s + 1 + sel.length); ta.focus(); });
    }
  };
}

/* ── button groups ───────────────────────────────────────── */

const GROUPS: { label: string; buttons: ToolbarBtn[] }[] = [
  {
    label: 'Headings',
    buttons: [
      { label: 'H1', title: 'Heading 1', action: linePrefix('# ') },
      { label: 'H2', title: 'Heading 2', action: linePrefix('## ') },
      { label: 'H3', title: 'Heading 3', action: linePrefix('### ') },
    ],
  },
  {
    label: 'Inline',
    buttons: [
      { label: 'B',  title: 'Bold · Ctrl+B',   action: inline('**') },
      { label: 'I',  title: 'Italic · Ctrl+I', action: inline('*') },
      { label: 'S',  title: 'Strikethrough',   action: inline('~~') },
      { label: '`',  title: 'Inline code',      action: inline('`') },
    ],
  },
  {
    label: 'Block',
    buttons: [
      { label: '"',   title: 'Blockquote', action: linePrefix('> ') },
      { label: '</>', title: 'Code block', action: insert('\n```\n\n```\n', 5) },
    ],
  },
  {
    label: 'List',
    buttons: [
      { label: '•', title: 'Bullet list',  action: linePrefix('- ') },
      { label: '1.', title: 'Ordered list', action: linePrefix('1. ') },
    ],
  },
  {
    label: 'Insert',
    buttons: [
      { label: 'Link',  title: 'Link',    action: inline('[', '](url)', 'link text') },
      { label: 'Image', title: 'Image',   action: insert('![alt](url)') },
      { label: '—',     title: 'Divider', action: insert('\n\n---\n\n') },
    ],
  },
  {
    label: 'MDX',
    buttons: [
      { label: 'Callout', title: 'MDX Callout', action: insert('\n<Callout>\n\n</Callout>\n', 12) },
      { label: 'import',  title: 'MDX import',  action: insert("import Component from './Component'\n") },
    ],
  },
  {
    label: 'Bidi',
    buttons: [
      { label: '→LTR', title: 'Force LTR', action: bidiWrap(true) },
      { label: 'RTL←', title: 'Force RTL', action: bidiWrap(false) },
    ],
  },
];

const DIR_OPTIONS: { value: 'ltr' | 'rtl' | 'auto'; label: string; title: string }[] = [
  { value: 'ltr',  label: 'LTR',  title: 'Left to right' },
  { value: 'rtl',  label: 'RTL',  title: 'Right to left' },
  { value: 'auto', label: 'Auto', title: 'Detect from content' },
];

/* ── component ───────────────────────────────────────────── */

export function Toolbar({ textareaRef, body, setBody, dir, onDirChange, onInsertImage }: Props) {
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const charCount = body.length;
  const [uploading, setUploading] = useState(false);

  const run = (btn: ToolbarBtn) => {
    const ta = textareaRef.current;
    if (!ta) return;
    btn.action(ta, body, setBody);
  };

  const handleInsertImage = async () => {
    if (!onInsertImage || uploading) return;
    setUploading(true);
    try { await onInsertImage(); } finally { setUploading(false); }
  };

  return (
    <div
      className="flex-shrink-0 border-b select-none"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      {/* Button row */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
        {GROUPS.map((group, gi) => (
          <div key={group.label} className="flex items-center">
            {gi > 0 && (
              <div
                className="w-px h-3.5 mx-1 flex-shrink-0"
                style={{ background: 'var(--border-2)' }}
              />
            )}
            {group.buttons.map(btn => (
              <button
                key={btn.title}
                onMouseDown={e => {
                  e.preventDefault();
                  run(btn);
                }}
                title={btn.title}
                className="toolbar-btn px-2 py-1 text-[11px]"
                style={{ minWidth: '1.6rem', textAlign: 'center' }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        ))}

        {/* Upload image button — shown when workspace has storage configured */}
        {onInsertImage && (
          <>
            <div className="w-px h-3.5 mx-1 flex-shrink-0" style={{ background: 'var(--border-2)' }} />
            <button
              onMouseDown={e => { e.preventDefault(); void handleInsertImage(); }}
              disabled={uploading}
              title="Upload image from disk"
              className="toolbar-btn px-2 py-1 text-[11px] disabled:opacity-50"
              style={{ minWidth: '1.6rem', textAlign: 'center', color: 'var(--accent)' }}
            >
              {uploading ? '...' : '+Img'}
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* Direction segment control */}
        <div className="mac-segmented">
          {DIR_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onMouseDown={e => { e.preventDefault(); onDirChange(opt.value); }}
              title={opt.title}
              className={`mac-segment${dir === opt.value ? ' active' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div
        className="flex items-center gap-3 px-3 py-1 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
          {charCount} chars
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
          {body.split('\n').length} lines
        </span>
      </div>
    </div>
  );
}
