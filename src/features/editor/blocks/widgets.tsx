/** The non-text blocks (code, table) and the editor's floating menus. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { CustomSelect } from '../../../components/CustomSelect';
import { IconLink } from '../../../components/Icons';
import { ResolvedHtml } from '../components/EditorImages';
import { mdToRuns, runsToHtml, type MarkKey, type Marks } from './inline';
import { parseCodeText, parseTableText, type BlockType, type Dir } from './model';

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

/* ─── Slash items ────────────────────────────────────────────────────── */

export interface SlashItem {
  /** `image` is not a block type: it uploads a file and inserts a markdown image. */
  type: BlockType | 'image';
  marker: string;
  /** Extra words the filter matches, in every language the app speaks. */
  keywords: string[];
}

export const SLASH_ITEMS: SlashItem[] = [
  { type: 'paragraph', marker: 'T',   keywords: ['text', 'paragraph', 'plain', 'p', 'نص', 'فقرة', 'texte', 'paragraphe'] },
  { type: 'heading1',  marker: 'H1',  keywords: ['heading', 'h1', 'title', '#', 'عنوان', 'titre'] },
  { type: 'heading2',  marker: 'H2',  keywords: ['heading', 'h2', 'subtitle', '##', 'عنوان', 'titre'] },
  { type: 'heading3',  marker: 'H3',  keywords: ['heading', 'h3', '###', 'عنوان', 'titre'] },
  { type: 'bullet',    marker: '•',   keywords: ['bullet', 'ul', 'list', 'unordered', '-', 'قائمة', 'نقطية', 'نقاط', 'liste', 'puces'] },
  { type: 'numbered',  marker: '1.',  keywords: ['numbered', 'ol', 'list', 'ordered', 'قائمة', 'مرقمة', 'ترقيم', 'liste', 'numérotée'] },
  { type: 'todo',      marker: '☑',   keywords: ['todo', 'to-do', 'task', 'checkbox', 'check', '[]', 'مهام', 'مهمة', 'tâche', 'tache'] },
  { type: 'quote',     marker: '"',   keywords: ['quote', 'blockquote', '>', 'اقتباس', 'citation'] },
  { type: 'callout',   marker: '💡',  keywords: ['callout', 'note', 'tip', 'warning', 'info', 'تنبيه', 'ملاحظة', 'encadré'] },
  { type: 'table',     marker: '▦',   keywords: ['table', 'grid', 'columns', 'جدول', 'tableau'] },
  { type: 'divider',   marker: '—',   keywords: ['divider', 'hr', 'line', 'separator', '---', 'فاصل', 'خط', 'séparateur'] },
  { type: 'code',      marker: '</>', keywords: ['code', 'snippet', 'pre', '```', 'كود', 'شيفرة', 'برمجة'] },
  { type: 'image',     marker: '🖼',  keywords: ['image', 'picture', 'photo', 'img', 'upload', 'صورة', 'photo'] },
];

/** Block types offered by "Turn into" (they keep the block's text). */
export const TURN_INTO: BlockType[] = ['paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'code'];

/** Items matching the query: label first, then keywords, then anywhere in label or hint. */
export function filterSlashItems(items: SlashItem[], query: string, t: TFunction): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const rank = (item: SlashItem) => {
    const label = t(`blocks.types.${item.type}`).toLowerCase();
    if (label.startsWith(q) || label.split(' ').some(w => w.startsWith(q))) return 0;
    if (item.keywords.some(k => k.startsWith(q))) return 1;
    if (label.includes(q) || t(`blocks.hints.${item.type}`).toLowerCase().includes(q)) return 2;
    return -1;
  };
  return items
    .map(item => ({ item, r: rank(item) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map(x => x.item);
}

/* ─── Slash menu ─────────────────────────────────────────────────────── */

export function SlashMenu({ items, active, query, anchor, dir, onHover, onPick }: {
  items: SlashItem[];
  active: number;
  query: string;
  /** Caret position the menu hangs from. */
  anchor: { x: number; top: number; bottom: number };
  dir: Dir;
  onHover: (index: number) => void;
  onPick: (item: SlashItem) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Below the caret, starting at it (ending at it for right-to-left text); above when there is no room.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = dir === 'rtl' ? anchor.x - r.width : anchor.x;
    const below = anchor.bottom + 6;
    setPos({
      left: Math.max(8, Math.min(left, window.innerWidth - r.width - 8)),
      top: below + r.height > window.innerHeight - 8 ? Math.max(8, anchor.top - r.height - 6) : below,
    });
  }, [anchor.x, anchor.top, anchor.bottom, dir, items.length]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-slash-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return createPortal(
    <div
      ref={ref}
      className="slash-menu slash-menu-floating mac-dropdown"
      role="listbox"
      aria-label={t('blocks.insert')}
      style={pos ? { left: pos.left, top: pos.top } : { left: anchor.x, top: anchor.bottom + 6, visibility: 'hidden' }}
      // Keeps the caret in the text while the menu is clicked.
      onMouseDown={e => e.preventDefault()}
    >
      {items.length === 0 ? (
        <div className="slash-empty">{t('blocks.noMatch', { query })}</div>
      ) : items.map((item, idx) => (
        <button
          key={item.type}
          type="button"
          role="option"
          aria-selected={active === idx}
          data-slash-idx={idx}
          className={active === idx ? 'active' : ''}
          onMouseEnter={() => onHover(idx)}
          onClick={() => onPick(item)}
        >
          <span className="slash-marker">{item.marker}</span>
          <span className="slash-copy">
            <strong>{t(`blocks.types.${item.type}`)}</strong>
            <small>{t(`blocks.hints.${item.type}`)}</small>
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* ─── Block menu (drag handle click, right-click) ────────────────────── */

export function BlockContextMenu({ x, y, type, count, onClose, onTurnInto, onInsertBelow, onDuplicate, onCopy, onDelete }: {
  x: number;
  y: number;
  type: BlockType;
  /** Number of blocks the menu acts on. */
  count: number;
  onClose: () => void;
  onTurnInto: (type: BlockType) => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);

  // Tables and dividers have no text to carry over, so they only get the block actions.
  const convertible = count === 1 && TURN_INTO.includes(type);
  const turnInto = convertible
    ? filterSlashItems(SLASH_ITEMS.filter(i => (TURN_INTO as string[]).includes(i.type)), filter, t)
    : [];
  const actions = [
    { id: 'insert', label: t('blocks.insertBelow'), marker: '+', run: onInsertBelow },
    { id: 'duplicate', label: t('blocks.duplicate'), marker: '⧉', hint: 'Ctrl+D', run: onDuplicate },
    { id: 'copy', label: t('blocks.copyMarkdown'), marker: '⎘', run: onCopy },
    { id: 'delete', label: t('blocks.delete'), marker: '⌫', hint: 'Del', run: onDelete, danger: true },
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
      aria-label={t('blocks.options')}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        if (total === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % total); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + total) % total); }
        if (e.key === 'Enter') { e.preventDefault(); run(active); }
      }}
    >
      <input
        autoFocus
        dir="auto"
        className="block-context-filter"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder={convertible ? t('blocks.turnIntoFilter') : t('blocks.actionsFilter')}
        aria-label={t('blocks.actionsFilter')}
      />
      {turnInto.length > 0 && <div className="block-context-label">{t('blocks.turnInto')}</div>}
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
          <span className="slash-copy"><strong>{t(`blocks.types.${item.type}`)}</strong></span>
          {item.type === type && <span className="block-context-check" aria-hidden="true">✓</span>}
        </button>
      ))}
      {turnInto.length > 0 && actions.length > 0 && <div className="block-context-sep" role="separator" />}
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
            {a.hint && <kbd className="block-context-kbd">{a.hint}</kbd>}
          </button>
        );
      })}
      {total === 0 && <div className="slash-empty">{t('blocks.noMatch', { query: filter })}</div>}
      <div className="block-context-hint">{t('blocks.nativeMenuHint')}</div>
    </div>,
    document.body,
  );
}

/* ─── Text menu (right-click in text, "more" in the selection toolbar) ── */

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** `Ctrl+B` on Windows / Linux, `⌘B` on a Mac. */
export const keyHint = (combo: string) =>
  IS_MAC ? combo.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : combo;

export type TextAction = 'cut' | 'copy' | 'paste' | 'pastePlain' | 'selectAll' | MarkKey | 'link' | 'block';

export function TextContextMenu({ x, y, hasSelection, marks, canLink, onAction, onClose }: {
  x: number;
  y: number;
  hasSelection: boolean;
  marks: Marks;
  /** A link can be added (text selected) or edited (caret in a link). */
  canLink: boolean;
  onAction: (action: TextAction) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);

  type Item = { id: TextAction; label: string; marker: React.ReactNode; hint?: string; disabled?: boolean; on?: boolean };
  const groups: Item[][] = [
    [
      { id: 'cut', label: t('blocks.text.cut'), marker: '✂', hint: 'Ctrl+X', disabled: !hasSelection },
      { id: 'copy', label: t('blocks.text.copy'), marker: '⎘', hint: 'Ctrl+C', disabled: !hasSelection },
      { id: 'paste', label: t('blocks.text.paste'), marker: '📋', hint: 'Ctrl+V' },
      { id: 'pastePlain', label: t('blocks.text.pastePlain'), marker: 'T', hint: 'Ctrl+Shift+V' },
      { id: 'selectAll', label: t('blocks.text.selectAll'), marker: '⬚', hint: 'Ctrl+A' },
    ],
    [
      { id: 'b', label: t('toolbar.bold'), marker: <strong>B</strong>, hint: 'Ctrl+B', on: !!marks.b },
      { id: 'i', label: t('toolbar.italic'), marker: <em>I</em>, hint: 'Ctrl+I', on: !!marks.i },
      { id: 's', label: t('toolbar.strikethrough'), marker: <s>S</s>, hint: 'Ctrl+Shift+S', on: !!marks.s },
      { id: 'c', label: t('toolbar.code'), marker: '</>', hint: 'Ctrl+E', on: !!marks.c },
      { id: 'link', label: marks.a !== undefined ? t('blocks.text.editLink') : t('toolbar.link'), marker: <IconLink size={13} />, hint: 'Ctrl+K', disabled: !canLink, on: marks.a !== undefined },
    ],
    [
      { id: 'block', label: t('blocks.options'), marker: '⋮⋮' },
    ],
  ];
  const flat = groups.flat();
  const enabled = flat.map((item, idx) => (item.disabled ? -1 : idx)).filter(i => i >= 0);

  const pick = (item: Item) => { if (!item.disabled) onAction(item.id); };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y]);

  // The caret stays in the text while the menu is open, so keys are caught on the window.
  const state = useRef({ active, enabled, flat, pick, onClose });
  state.current = { active, enabled, flat, pick, onClose };
  useEffect(() => {
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) state.current.onClose(); };
    const close = () => state.current.onClose();
    const keys = (e: KeyboardEvent) => {
      const s = state.current;
      const step = (d: 1 | -1) => {
        const at = s.enabled.indexOf(s.active);
        const next = at === -1 ? (d === 1 ? 0 : s.enabled.length - 1) : (at + d + s.enabled.length) % s.enabled.length;
        setActive(s.enabled[next]);
      };
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); s.onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); step(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); step(-1); return; }
      if (e.key === 'Enter' && s.active >= 0) { e.preventDefault(); e.stopPropagation(); s.pick(s.flat[s.active]); return; }
      // Anything else (typing, a shortcut) goes to the text and the menu gets out of the way.
      if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) s.onClose();
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    document.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', keys, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      document.removeEventListener('scroll', close, true);
    };
  }, []);

  let idx = -1;
  return createPortal(
    <div
      ref={ref}
      className="slash-menu block-context-menu text-context-menu mac-dropdown"
      role="menu"
      aria-label={t('blocks.formatting')}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={e => e.preventDefault()}
      // Keeps the selection in the text while the menu is clicked.
      onMouseDown={e => e.preventDefault()}
    >
      {groups.map((group, g) => (
        <div key={g} role="group">
          {g > 0 && <div className="block-context-sep" role="separator" />}
          {group.map(item => {
            const i = ++idx;
            return (
              <button
                key={item.id}
                type="button"
                role={item.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={item.on === undefined ? undefined : item.on}
                aria-disabled={item.disabled || undefined}
                disabled={item.disabled}
                className={`${active === i ? 'active' : ''}${item.on ? ' is-on' : ''}`}
                onMouseEnter={() => setActive(item.disabled ? -1 : i)}
                onMouseLeave={() => setActive(-1)}
                onClick={() => pick(item)}
              >
                <span className="slash-marker">{item.marker}</span>
                <span className="slash-copy"><strong>{item.label}</strong></span>
                {item.on && <span className="block-context-check" aria-hidden="true">✓</span>}
                {item.hint && <kbd className="block-context-kbd">{keyHint(item.hint)}</kbd>}
              </button>
            );
          })}
        </div>
      ))}
      <div className="block-context-hint">{t('blocks.nativeMenuHint')}</div>
    </div>,
    document.body,
  );
}

/* ─── Selection toolbar ──────────────────────────────────────────────── */

export interface FormatState {
  /** Selection rectangle, in viewport coordinates. */
  rect: { left: number; right: number; top: number; bottom: number };
  marks: Marks;
}

export function FormatToolbar({ state, link, onToggle, onCopy, onCut, onMore, onLinkOpen, onLinkChange, onLinkApply, onLinkCancel }: {
  state: FormatState;
  /** Set while the link address is being typed. */
  link: string | null;
  onToggle: (key: MarkKey) => void;
  onCopy: () => void;
  onCut: () => void;
  /** Opens the full text menu under the given button. */
  onMore: (button: HTMLElement) => void;
  onLinkOpen: () => void;
  onLinkChange: (value: string) => void;
  onLinkApply: () => void;
  onLinkCancel: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { rect, marks } = state;
  const editingLink = link !== null;

  // The address field takes the keyboard once it is on screen (a hidden element can't be focused).
  useEffect(() => {
    if (editingLink && pos) linkInput.current?.focus();
  }, [editingLink, pos !== null]);

  // Centred above the selection; below it when there is no room above.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = (rect.left + rect.right) / 2 - r.width / 2;
    const above = rect.top - r.height - 8;
    setPos({
      left: Math.max(8, Math.min(left, window.innerWidth - r.width - 8)),
      top: above < 8 ? rect.bottom + 8 : above,
    });
  }, [rect.left, rect.right, rect.top, rect.bottom, link === null]);

  const buttons: { key: MarkKey; label: string; hint: string; body: React.ReactNode }[] = [
    { key: 'b', label: t('toolbar.bold'), hint: 'Ctrl+B', body: <strong>B</strong> },
    { key: 'i', label: t('toolbar.italic'), hint: 'Ctrl+I', body: <em>I</em> },
    { key: 's', label: t('toolbar.strikethrough'), hint: 'Ctrl+Shift+S', body: <s>S</s> },
    { key: 'c', label: t('toolbar.code'), hint: 'Ctrl+E', body: <span className="format-toolbar-code">{'</>'}</span> },
  ];

  return createPortal(
    <div
      ref={ref}
      className="floating-toolbar format-toolbar"
      role="toolbar"
      aria-label={t('blocks.formatting')}
      style={pos ? { left: pos.left, top: pos.top } : { left: rect.left, top: rect.top, visibility: 'hidden' }}
      // Buttons act on the text selection, so they must not take the focus away from it.
      onMouseDown={e => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); }}
    >
      {link !== null ? (
        <input
          ref={linkInput}
          dir="ltr"
          className="format-toolbar-link"
          value={link}
          placeholder={t('blocks.linkPlaceholder')}
          aria-label={t('toolbar.link')}
          onChange={e => onLinkChange(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); onLinkApply(); }
            if (e.key === 'Escape') { e.preventDefault(); onLinkCancel(); }
          }}
          onBlur={onLinkCancel}
        />
      ) : (
        <>
          {buttons.map(b => (
            <button
              key={b.key}
              type="button"
              className={`floating-toolbar-btn${marks[b.key] ? ' active' : ''}`}
              title={`${b.label} (${keyHint(b.hint)})`}
              aria-label={b.label}
              aria-pressed={!!marks[b.key]}
              onClick={() => onToggle(b.key)}
            >
              {b.body}
            </button>
          ))}
          <div className="floating-toolbar-divider" />
          <button
            type="button"
            className={`floating-toolbar-btn${marks.a !== undefined ? ' active' : ''}`}
            title={`${t('toolbar.link')} (${keyHint('Ctrl+K')})`}
            aria-label={t('toolbar.link')}
            aria-pressed={marks.a !== undefined}
            onClick={onLinkOpen}
          >
            <IconLink size={15} />
          </button>
          <div className="floating-toolbar-divider" />
          <button
            type="button"
            className="floating-toolbar-btn"
            title={`${t('blocks.text.copy')} (${keyHint('Ctrl+C')})`}
            aria-label={t('blocks.text.copy')}
            onClick={onCopy}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button
            type="button"
            className="floating-toolbar-btn"
            title={`${t('blocks.text.cut')} (${keyHint('Ctrl+X')})`}
            aria-label={t('blocks.text.cut')}
            onClick={onCut}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
            </svg>
          </button>
          <button
            type="button"
            className="floating-toolbar-btn"
            title={t('blocks.text.more')}
            aria-label={t('blocks.text.more')}
            aria-haspopup="menu"
            onClick={e => onMore(e.currentTarget)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

/* ─── Code block ─────────────────────────────────────────────────────── */

const LANGS: [string, string][] = [
  ['bash', 'Bash'], ['c', 'C'], ['cpp', 'C++'], ['css', 'CSS'], ['go', 'Go'], ['html', 'HTML'], ['java', 'Java'],
  ['javascript', 'JavaScript'], ['json', 'JSON'], ['markdown', 'Markdown'], ['php', 'PHP'], ['python', 'Python'],
  ['ruby', 'Ruby'], ['rust', 'Rust'], ['shell', 'Shell'], ['sql', 'SQL'], ['swift', 'Swift'],
  ['typescript', 'TypeScript'], ['yaml', 'YAML'],
];

export function CodeBlock({ blockId, text, onFocus, onChange, onExit, onNavigate, onRemove, onEscape }: {
  blockId: string;
  text: string;
  onFocus: () => void;
  onChange: (v: string) => void;
  /** Ctrl+Enter: continue writing below the block. */
  onExit: () => void;
  /** Arrow up / down past the first / last line. */
  onNavigate: (delta: -1 | 1) => void;
  /** Backspace in an empty block. */
  onRemove: () => void;
  onEscape: () => void;
}) {
  const { t } = useTranslation();
  const { lang, code } = parseCodeText(text);
  const [copied, setCopied] = useState(false);

  const options = useMemo(
    () => [{ value: '', label: t('blocks.plainText') }, ...LANGS.map(([value, label]) => ({ value, label }))],
    [t],
  );

  const highlighted = useMemo(() => {
    if (!code) return '';
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value; } catch { /* fall through */ }
    }
    return hljs.highlightAuto(code).value;
  }, [lang, code]);

  const update = (nextLang: string, nextCode: string) => onChange(nextLang + '\n' + nextCode);

  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = (s: string) => {
      e.preventDefault();
      update(lang, code.slice(0, start) + s + code.slice(end));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + s.length; });
    };
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onExit(); return; }
    if (e.key === 'Backspace' && code === '') { e.preventDefault(); onRemove(); return; }
    if (e.key === 'Tab' && !e.shiftKey) { insert('  '); return; }
    // A new line starts at the indentation of the one above.
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      const lineStart = code.lastIndexOf('\n', start - 1) + 1;
      insert('\n' + (/^[ \t]*/.exec(code.slice(lineStart, start))?.[0] ?? ''));
      return;
    }
    if (start !== end || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowUp' && !code.slice(0, start).includes('\n')) { e.preventDefault(); onNavigate(-1); }
    if (e.key === 'ArrowDown' && !code.slice(end).includes('\n')) { e.preventDefault(); onNavigate(1); }
  };

  return (
    <div className="code-block-wrapper" dir="ltr">
      <div className="code-block-header">
        <CustomSelect
          value={lang}
          options={options}
          onChange={v => update(v, code)}
          variant="code"
          size="sm"
          menuMinWidth={170}
          ariaLabel={t('blocks.language')}
        />
        <button type="button" className="code-copy-btn" onClick={copy} tabIndex={-1}>
          {copied ? `✓ ${t('blocks.copied')}` : t('blocks.copy')}
        </button>
      </div>
      <div className="code-block-body">
        <pre className="code-highlight hljs" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlighted + '\n' }} />
        <textarea
          value={code}
          data-block-input={blockId}
          onChange={e => update(lang, e.target.value)}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          className="code-block-textarea"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={t('blocks.codePlaceholder')}
          aria-label={t('blocks.types.code')}
        />
      </div>
    </div>
  );
}

/* ─── Table block ────────────────────────────────────────────────────── */

function CellView({ text }: { text: string }) {
  const html = useMemo(() => runsToHtml(mdToRuns(text)) || '&nbsp;', [text]);
  return <ResolvedHtml html={html} className="table-cell-view block-text" dir="auto" />;
}

export function TableBlock({ blockId, text, editorStyle, isEditing, onEnterEdit, onBlur, onChange, onNavigate, onRemove, onEscape }: {
  blockId: string;
  text: string;
  editorStyle: React.CSSProperties;
  isEditing: boolean;
  onEnterEdit: () => void;
  onBlur: () => void;
  onChange: (v: string) => void;
  onNavigate: (delta: -1 | 1) => void;
  onRemove: () => void;
  onEscape: () => void;
}) {
  const { t } = useTranslation();
  const { headers, rows } = parseTableText(text);
  const tid = useRef(`t${crypto.randomUUID().slice(0, 8)}`).current;

  useEffect(() => {
    if (!isEditing) return;
    const id = window.setTimeout(() => {
      const first = document.querySelector<HTMLInputElement>(`[data-tcell="${tid}-h-0"]`);
      // Only when the caret is not already in one of this table's cells.
      if (first && !first.closest('table')?.contains(document.activeElement)) first.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isEditing, tid]);

  const ser = (h: string[], r: string[][]) => [h, ...r].map(row => row.join('|')).join('\n');

  const setCell = (rowIdx: number, colIdx: number, value: string) => {
    // A pipe would split the cell in two.
    const clean = value.replace(/\|/g, '');
    if (rowIdx === -1) {
      const nh = [...headers]; nh[colIdx] = clean;
      onChange(ser(nh, rows));
    } else {
      const nr = rows.map(r => [...r]); nr[rowIdx][colIdx] = clean;
      onChange(ser(headers, nr));
    }
  };

  const focusCell = (rowIdx: number, colIdx: number) => {
    const key = rowIdx === -1 ? `${tid}-h-${colIdx}` : `${tid}-${rowIdx}-${colIdx}`;
    document.querySelector<HTMLInputElement>(`[data-tcell="${key}"]`)?.focus();
  };

  const addRow = () => {
    onChange(ser(headers, [...rows, Array(headers.length).fill('')]));
    const newIdx = rows.length;
    requestAnimationFrame(() => focusCell(newIdx, 0));
  };

  const addCol = () => {
    onChange(ser([...headers, ''], rows.map(r => [...r, ''])));
    requestAnimationFrame(() => focusCell(-1, headers.length));
  };

  const deleteRow = (rowIdx: number) => {
    if (rows.length <= 1) { onRemove(); return; }
    onChange(ser(headers, rows.filter((_, i) => i !== rowIdx)));
    requestAnimationFrame(() => focusCell(Math.max(0, rowIdx - 1), 0));
  };

  const deleteCol = (colIdx: number) => {
    if (headers.length <= 1) { onRemove(); return; }
    onChange(ser(headers.filter((_, i) => i !== colIdx), rows.map(r => r.filter((_, i) => i !== colIdx))));
    requestAnimationFrame(() => focusCell(-1, Math.max(0, colIdx - 1)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const colCount = headers.length;
    const rowCount = rows.length;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey) {
        if (colIdx < colCount - 1) focusCell(rowIdx, colIdx + 1);
        else if (rowIdx < rowCount - 1) focusCell(rowIdx + 1, 0);
        else addRow();
      } else if (colIdx > 0) focusCell(rowIdx, colIdx - 1);
      else if (rowIdx >= 0) focusCell(rowIdx - 1, colCount - 1);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (rowIdx < rowCount - 1) focusCell(rowIdx + 1, colIdx);
      else addRow();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx >= 0) focusCell(rowIdx - 1, colIdx);
      else onNavigate(-1);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < rowCount - 1) focusCell(rowIdx + 1, colIdx);
      else onNavigate(1);
    }
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
  };

  const inputStyle: React.CSSProperties = {
    fontSize: (editorStyle.fontSize as number) ?? 14,
    fontFamily: editorStyle.fontFamily ?? 'inherit',
  };

  if (!isEditing) {
    return (
      <div
        className="table-block-wrapper"
        data-block-input={blockId}
        onClick={onEnterEdit}
        role="button"
        tabIndex={0}
        style={{ cursor: 'text' }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onEnterEdit(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); onNavigate(-1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onNavigate(1); }
          if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onRemove(); }
          if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
        }}
      >
        <div className="table-block-scroll">
          <table className="table-block">
            <thead>
              <tr>{headers.map((h, colIdx) => <th key={colIdx}><CellView text={h} /></th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="table-data-row">
                  {row.map((cell, colIdx) => <td key={colIdx}><CellView text={cell} /></td>)}
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
      className="table-block-wrapper editing"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onBlur(); }}
    >
      <div className="table-block-scroll">
        <table className="table-block">
          <thead>
            <tr>
              {headers.map((h, colIdx) => (
                <th key={colIdx}>
                  <input
                    dir="auto"
                    data-tcell={`${tid}-h-${colIdx}`}
                    value={h}
                    onChange={e => setCell(-1, colIdx, e.target.value)}
                    onKeyDown={e => {
                      // Backspace in an empty header removes its (empty) column.
                      if (e.key === 'Backspace' && h === '' && rows.every(r => !r[colIdx])) { e.preventDefault(); deleteCol(colIdx); return; }
                      handleKeyDown(e, -1, colIdx);
                    }}
                    placeholder={t('blocks.tableHeader')}
                    className="table-cell-input"
                    style={inputStyle}
                  />
                </th>
              ))}
              <th className="table-add-col-th">
                <button type="button" className="table-add-btn" onClick={addCol} tabIndex={-1} title={t('blocks.addColumn')} aria-label={t('blocks.addColumn')}>+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="table-data-row">
                {row.map((cell, colIdx) => (
                  <td key={colIdx}>
                    <input
                      dir="auto"
                      data-tcell={`${tid}-${rowIdx}-${colIdx}`}
                      value={cell}
                      onChange={e => setCell(rowIdx, colIdx, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)}
                      className="table-cell-input"
                      style={inputStyle}
                    />
                  </td>
                ))}
                <td className="table-row-actions">
                  <button type="button" className="table-row-delete-btn" onClick={() => deleteRow(rowIdx)} tabIndex={-1} title={t('blocks.deleteRow')} aria-label={t('blocks.deleteRow')}>×</button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={headers.length + 1} className="table-add-row-cell">
                <button type="button" className="table-add-row-btn" onClick={addRow} tabIndex={-1}>+ {t('blocks.addRow')}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
