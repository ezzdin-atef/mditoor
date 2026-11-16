import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ResolvedImg, useEditorImages } from './EditorImages';
import { EditableText, type CaretPos, type ChangeInfo, type EditableHandle, type EditableHub } from '../blocks/EditableText';
import { hrefOf, mdToRuns, plainOf, replaceRange, runsToMd, sliceRuns, type MarkKey, type Marks } from '../blocks/inline';
import {
  CALLOUT_EMOJI, CALLOUT_JSX_TYPES, block, blockDirs, calloutParts, isList, isText, listNumbers, newId,
  normalizeIndents, parseCodeText, parseMarkdownBlocks, serializeMarkdownBlocks, textOf, withText,
  type Block, type BlockType, type Dir,
} from '../blocks/model';
import {
  BlockContextMenu, CodeBlock, FormatToolbar, SLASH_ITEMS, SlashMenu, TableBlock, TextContextMenu, filterSlashItems,
  type FormatState, type SlashItem, type TextAction,
} from '../blocks/widgets';

export { parseMarkdownBlocks, serializeMarkdownBlocks };

interface Props {
  value: string;
  onChange: (value: string) => void;
  editorStyle: React.CSSProperties;
  onInsertImage?: () => Promise<string | null>;
}

/** Where the caret goes once the next render is on screen. */
interface Focus {
  id: string;
  at?: CaretPos;
  end?: number;
  /** Re-check for a `/` command after focusing (the + button starts one). */
  slash?: boolean;
}

interface Snapshot {
  blocks: Block[];
  caret: Focus | null;
}

interface SlashState {
  blockId: string;
  /** Text offset of the `/`. */
  start: number;
  query: string;
  anchor: { x: number; top: number; bottom: number };
}

/** Drag payload type; a custom type so text fields never accept the drop as pasted text. */
const BLOCK_MIME = 'application/x-mditoor-block';

const IMAGE_ONLY = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
/** A paragraph that is just one image is shown as an image block. */
const imageOf = (b: Block) => (b.type === 'paragraph' ? IMAGE_ONLY.exec(b.text.trim()) : null);

const textLength = (md: string) => plainOf(mdToRuns(md)).length;

/** Ctrl+Shift+digit turns the block into this type (the digit row, whatever the keyboard layout). */
const DIGIT_TYPES: Record<string, BlockType> = {
  Digit0: 'paragraph', Digit1: 'heading1', Digit2: 'heading2', Digit3: 'heading3',
  Digit4: 'todo', Digit5: 'bullet', Digit6: 'numbered', Digit7: 'quote', Digit8: 'code',
};

/**
 * What a markdown marker typed at the start of a block turns it into (`# `, `- `, `1. `,
 * `> `, `[] `, three backticks, `---`), and how many characters the marker takes.
 * `before` is the text prior to this edit: a marker that was already there is left alone.
 */
function blockShortcut(b: Block, before: string, plain: string, caret: number): { type: BlockType; checked?: boolean; cut: number } | null {
  if (b.type !== 'paragraph' && b.type !== 'bullet') return null;
  if (b.type === 'paragraph' && plain !== before) {
    if (plain === '```') return { type: 'code', cut: 3 };
    if (plain === '---') return { type: 'divider', cut: 3 };
  }
  const m = /^(#{1,3}|[-*+]|\d{1,9}[.)]|>|\[[ xX]?\]) /.exec(plain);
  if (!m || caret < m[0].length || before.startsWith(m[0])) return null;
  const mark = m[1];
  const cut = m[0].length;
  if (mark.startsWith('[')) return { type: 'todo', checked: /x/i.test(mark), cut };
  if (b.type !== 'paragraph') return null;
  if (mark.startsWith('#')) return { type: mark.length === 1 ? 'heading1' : mark.length === 2 ? 'heading2' : 'heading3', cut };
  if (mark === '>') return { type: 'quote', cut };
  return { type: /\d/.test(mark) ? 'numbered' : 'bullet', cut };
}

/** An empty block of `type` carrying `text`. */
function blockOfType(type: BlockType, text = '', base: Partial<Block> = {}): Block {
  const id = base.id ?? newId();
  if (type === 'callout') return { id, type, text: `💡\n${text}` };
  if (type === 'table') return { id, type, text: '|\n|' };
  if (type === 'divider') return { id, type, text: '' };
  if (type === 'code') return { id, type, text: `\n${text}` };
  if (type === 'todo') return { id, type, text, indent: base.indent ?? 0, checked: false };
  if (isList(type)) return { id, type, text, indent: base.indent ?? 0 };
  return { id, type, text };
}

const BULLETS = ['•', '◦', '▪'];

export function BlockEditor({ value, onChange, editorStyle, onInsertImage }: Props) {
  const { t, i18n } = useTranslation();
  const uiDir: Dir = i18n.dir() === 'rtl' ? 'rtl' : 'ltr';

  const [blocks, setBlocksState] = useState<Block[]>(() => parseMarkdownBlocks(value));
  const blocksRef = useRef(blocks);
  const lastEmitted = useRef(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const handles = useRef(new Map<string, EditableHandle>());
  const focusedRef = useRef<string | null>(null);
  const pending = useRef<Focus | null>(null);
  const history = useRef<{ undo: Snapshot[]; redo: Snapshot[]; last: { key: string; at: number } | null }>({ undo: [], redo: [], last: null });

  // Whole blocks selected (Esc, Shift+arrows past a block's edge, or dragging across blocks).
  const [selected, setSelected] = useState<{ anchor: string; focus: string } | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  // A `/` the user closed with Esc stays closed until they type another one.
  const slashDismissed = useRef<{ blockId: string; start: number } | null>(null);
  const [menu, setMenu] = useState<{ blockId: string; x: number; y: number } | null>(null);
  const [format, setFormat] = useState<(FormatState & { blockId: string }) | null>(null);
  const [link, setLink] = useState<{ blockId: string; start: number; end: number; value: string } | null>(null);
  const linkRef = useRef(link);
  linkRef.current = link;
  // Right-click menu for text; keeps the selection it was opened on.
  const [textMenu, setTextMenu] = useState<{
    blockId: string; x: number; y: number; start: number; end: number; marks: Marks; canLink: boolean;
  } | null>(null);
  const textMenuRef = useRef(textMenu);
  textMenuRef.current = textMenu;
  // The next paste goes in as plain text (Ctrl+Shift+V, or "Paste as plain text").
  const plainPaste = useRef(false);
  const [editingTable, setEditingTable] = useState<string | null>(null);
  // An image block being edited as markdown.
  const [rawImage, setRawImage] = useState<string | null>(null);

  const [draggingIds, setDraggingIds] = useState<string[] | null>(null);
  // Gap the dragged blocks would land in: 0 = before the first block, blocks.length = after the last.
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  // Briefly highlights blocks after they were dropped so the eye can follow them.
  const [justDropped, setJustDropped] = useState<string[] | null>(null);

  const images = useEditorImages();

  const all = () => blocksRef.current;
  const indexOf = (id: string) => all().findIndex(b => b.id === id);
  const replaceAt = (idx: number, ...repl: Block[]) => [...all().slice(0, idx), ...repl, ...all().slice(idx + 1)];

  /* ─── State, history, focus ─────────────────────────────────────────── */

  const currentCaret = (): Focus | null => {
    const id = focusedRef.current;
    if (!id) return null;
    const sel = handles.current.get(id)?.selection();
    return sel ? { id, at: sel.start, end: sel.end } : { id };
  };

  const apply = (next: Block[], focus?: Focus) => {
    blocksRef.current = next;
    setBlocksState(next);
    const markdown = serializeMarkdownBlocks(next);
    lastEmitted.current = markdown;
    onChange(markdown);
    if (focus) pending.current = focus;
  };

  /** Applies an edit as one undo step; consecutive typing in one block is a single step. */
  const commit = (next: Block[], opts: { focus?: Focus; typing?: string } = {}) => {
    const h = history.current;
    const now = Date.now();
    const sameBurst = !!opts.typing && h.last?.key === opts.typing && now - h.last.at < 1000;
    if (!sameBurst) {
      h.undo.push({ blocks: all(), caret: currentCaret() });
      if (h.undo.length > 300) h.undo.shift();
    }
    h.redo = [];
    h.last = opts.typing ? { key: opts.typing, at: now } : null;
    apply(normalizeIndents(next.length ? next : [block('paragraph')]), opts.focus);
  };

  const travel = (from: Snapshot[], to: Snapshot[]) => {
    const snap = from.pop();
    if (!snap) return;
    to.push({ blocks: all(), caret: currentCaret() });
    history.current.last = null;
    setSelected(null);
    setSlash(null);
    apply(snap.blocks, snap.caret ?? undefined);
  };
  const undo = () => travel(history.current.undo, history.current.redo);
  const redo = () => travel(history.current.redo, history.current.undo);

  const focusNow = (f: Focus) => {
    const h = handles.current.get(f.id);
    if (h) {
      h.focus(f.at ?? 'end', f.end);
      if (f.slash) refreshSlash(f.id);
      return;
    }
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-block-input="${f.id}"]`);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      const at = f.at === 'start' || f.at === 0 ? 0 : el.value.length;
      el.setSelectionRange(at, at);
    }
  };

  // Runs after the blocks' own layout effects, so new text is already on screen.
  useLayoutEffect(() => {
    const f = pending.current;
    if (!f) return;
    pending.current = null;
    focusNow(f);
  });

  // The post changed from outside (another post, the markdown view, a sync).
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const next = parseMarkdownBlocks(value);
    blocksRef.current = next;
    setBlocksState(next);
    history.current = { undo: [], redo: [], last: null };
    setSelected(null);
    setSlash(null);
  }, [value]);

  useEffect(() => {
    if (!justDropped) return;
    const id = window.setTimeout(() => setJustDropped(null), 700);
    return () => window.clearTimeout(id);
  }, [justDropped]);

  /* ─── Block operations ──────────────────────────────────────────────── */

  const updateBlock = (id: string, patch: Partial<Block>, typing = true) => {
    const idx = indexOf(id);
    if (idx === -1) return;
    commit(replaceAt(idx, { ...all()[idx], ...patch }), typing ? { typing: id } : {});
  };

  const insertAfter = (id: string, nb: Block = block('paragraph'), focus: Focus = { id: nb.id, at: 'start' }) => {
    const idx = indexOf(id);
    commit([...all().slice(0, idx + 1), nb, ...all().slice(idx + 1)], { focus });
  };

  const removeBlocks = (ids: string[]) => {
    const first = indexOf(ids[0]);
    const next = all().filter(b => !ids.includes(b.id));
    if (next.length === 0) {
      const nb = block('paragraph');
      commit([nb], { focus: { id: nb.id } });
      return;
    }
    const before = all()[first - 1];
    commit(next, { focus: before ? { id: before.id, at: 'end' } : { id: next[0].id, at: 'start' } });
  };

  /** Keeps the block's text; callouts and code carry theirs over. */
  const convertBlock = (id: string, type: BlockType) => {
    const idx = indexOf(id);
    if (idx === -1) return;
    const current = all()[idx];
    if (current.type === type) { focusNow({ id }); return; }
    const existing = current.type === 'code' ? parseCodeText(current.text).code
      : current.type === 'table' || current.type === 'divider' ? ''
      : textOf(current);
    const nb = blockOfType(type, existing, { id, indent: current.indent });
    if (type === 'divider' && !all()[idx + 1]) {
      const para = block('paragraph');
      commit(replaceAt(idx, nb, para), { focus: { id: para.id } });
      return;
    }
    if (type === 'table') setEditingTable(id);
    commit(replaceAt(idx, nb), { focus: { id, at: 'end' } });
  };

  const duplicate = (ids: string[], reselect: boolean) => {
    const group = all().filter(b => ids.includes(b.id));
    if (!group.length) return;
    const copies = group.map(b => ({ ...b, id: newId() }));
    const last = indexOf(group[group.length - 1].id);
    commit([...all().slice(0, last + 1), ...copies, ...all().slice(last + 1)],
      reselect ? {} : { focus: { id: copies[copies.length - 1].id, at: 'end' } });
    if (reselect) setSelected({ anchor: copies[0].id, focus: copies[copies.length - 1].id });
  };

  /** Moves blocks so they land at `slot` (an index between blocks, 0..length). */
  const moveTo = (ids: string[], slot: number, focus?: Focus) => {
    const moving = all().filter(b => ids.includes(b.id));
    const without = all().filter(b => !ids.includes(b.id));
    const at = slot - all().slice(0, slot).filter(b => ids.includes(b.id)).length;
    const next = [...without.slice(0, at), ...moving, ...without.slice(at)];
    if (next.every((b, i) => b === all()[i])) return false;
    commit(next, { focus });
    return true;
  };

  /** Moves a run of neighbouring blocks one place up or down. */
  const nudge = (ids: string[], delta: -1 | 1, focus?: Focus) => {
    const lo = indexOf(ids[0]);
    const hi = indexOf(ids[ids.length - 1]);
    if (delta < 0 ? lo === 0 : hi === all().length - 1) return;
    moveTo(ids, delta < 0 ? lo - 1 : hi + 2, focus);
  };

  const indentBy = (ids: string[], delta: -1 | 1, focus?: Focus) => {
    const next = all().map(b => (ids.includes(b.id) && isList(b.type) ? { ...b, indent: Math.max(0, (b.indent ?? 0) + delta) } : b));
    commit(next, { focus });
  };

  const copyBlocks = (ids: string[]) => {
    const md = serializeMarkdownBlocks(all().filter(b => ids.includes(b.id)));
    navigator.clipboard.writeText(md).catch(() => {});
  };

  /* ─── Block selection ───────────────────────────────────────────────── */

  const selectRange = (anchor: string, focus: string) => {
    setSelected({ anchor, focus });
    setSlash(null);
    setFormat(null);
    window.getSelection()?.removeAllRanges();
    rootRef.current?.focus({ preventScroll: true });
    rootRef.current?.querySelector(`[data-block-row="${focus}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const selRange = (() => {
    if (!selected) return null;
    const a = blocks.findIndex(b => b.id === selected.anchor);
    const f = blocks.findIndex(b => b.id === selected.focus);
    return a === -1 || f === -1 ? null : { lo: Math.min(a, f), hi: Math.max(a, f), focus: f };
  })();
  const selectedIds = selRange ? blocks.slice(selRange.lo, selRange.hi + 1).map(b => b.id) : [];

  /* ─── Slash commands ────────────────────────────────────────────────── */

  const slashItems = useMemo(() => SLASH_ITEMS.filter(item => item.type !== 'image' || onInsertImage), [onInsertImage]);
  const slashMatches = slash ? filterSlashItems(slashItems, slash.query, t) : [];

  /** Opens, updates or closes the `/` menu from the text before the caret. */
  function refreshSlash(id: string) {
    const h = handles.current.get(id);
    const sel = h?.selection();
    if (!h || !sel || sel.start !== sel.end) { setSlash(null); return; }
    const m = /(?:^|\s)\/([^/\n]{0,30})$/.exec(h.plain().slice(0, sel.start));
    if (!m || m[1].startsWith(' ')) { slashDismissed.current = null; setSlash(null); return; }
    const query = m[1];
    const start = sel.start - query.length - 1;
    const dismissed = slashDismissed.current;
    if (dismissed && dismissed.blockId === id && dismissed.start === start) { setSlash(null); return; }
    // Nothing matches and the text went on: it was a plain slash, not a command.
    if (!filterSlashItems(slashItems, query, t).length && (query.includes(' ') || query.length > 10)) { setSlash(null); return; }
    const prev = slashRef.current;
    if (prev && prev.blockId === id && prev.start === start) {
      if (prev.query !== query) { setSlash({ ...prev, query }); setSlashIndex(0); }
      return;
    }
    const r = h.caretRect();
    const box = h.el.getBoundingClientRect();
    const anchor = r
      ? { x: r.left, top: r.top, bottom: r.bottom }
      : { x: getComputedStyle(h.el).direction === 'rtl' ? box.right : box.left, top: box.top, bottom: box.bottom };
    setSlash({ blockId: id, start, query, anchor });
    setSlashIndex(0);
  }

  const runSlashItem = async (item: SlashItem) => {
    const state = slashRef.current;
    if (!state) return;
    const h = handles.current.get(state.blockId);
    const idx = indexOf(state.blockId);
    setSlash(null);
    if (!h || idx === -1) return;
    const b = all()[idx];
    // Take the `/command` back out of the text.
    const rest = replaceRange(h.runs(), state.start, h.selection()?.end ?? state.start, []);
    const restMd = runsToMd(rest);
    const empty = plainOf(rest).trim() === '';
    const cleaned = withText(b, restMd);

    if (item.type === 'image') {
      commit(replaceAt(idx, cleaned), { focus: { id: b.id, at: state.start } });
      const url = await onInsertImage?.();
      if (!url) return;
      const name = url.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'image';
      const img = block('paragraph', `![${name}](${url})`);
      const at = indexOf(b.id);
      if (at === -1) return;
      const after = block('paragraph');
      const tail = all()[at + 1] ? [] : [after];
      const focus = { id: tail.length ? after.id : all()[at + 1].id, at: 'start' as const };
      commit(empty && b.type === 'paragraph' ? replaceAt(at, img, ...tail) : replaceAt(at, all()[at], img, ...tail), { focus });
      return;
    }

    // An empty block becomes the chosen type; otherwise the new block goes below the text.
    if (empty) {
      commit(replaceAt(idx, cleaned));
      convertBlock(b.id, item.type);
      return;
    }
    const nb = blockOfType(item.type);
    if (item.type === 'table') setEditingTable(nb.id);
    const extra = item.type === 'divider' && !all()[idx + 1] ? [block('paragraph')] : [];
    commit(replaceAt(idx, cleaned, nb, ...extra), { focus: { id: extra[0]?.id ?? nb.id, at: 'start' } });
  };

  /* ─── Text editing ──────────────────────────────────────────────────── */

  const onTextChange = (id: string, md: string, info: ChangeInfo) => {
    const idx = indexOf(id);
    if (idx === -1) return;
    const b = all()[idx];
    const h = handles.current.get(id);
    const next = withText(b, md);
    commit(replaceAt(idx, next), { typing: id });

    const inserted = !!info.inputType?.startsWith('insert') && info.inputType !== 'insertFromPaste';
    const shortcut = h && inserted && info.caret !== null ? blockShortcut(b, plainOf(mdToRuns(textOf(b))), info.plain, info.caret) : null;
    if (h && shortcut && info.caret !== null) {
      // A separate undo step: Ctrl+Z gives back the characters that were typed.
      history.current.last = null;
      const rest = h.splitAt(shortcut.cut, shortcut.cut)[1];
      const at = info.caret - shortcut.cut;
      setSlash(null);
      if (shortcut.type === 'divider') {
        const para = block('paragraph', rest);
        commit(replaceAt(idx, { id, type: 'divider', text: '' }, para), { focus: { id: para.id, at: 'start' } });
      } else if (shortcut.type === 'code') {
        commit(replaceAt(idx, blockOfType('code', rest, { id })), { focus: { id } });
      } else {
        commit(replaceAt(idx, { ...blockOfType(shortcut.type, rest, { id, indent: b.indent }), ...(shortcut.checked ? { checked: true } : {}) }),
          { focus: { id, at } });
      }
      return;
    }
    // Typing a lone image turns the paragraph into an image block; keep the keyboard on it.
    if (imageOf(next)) { pending.current = { id }; return; }
    refreshSlash(id);
  };

  const enter = (b: Block, h: EditableHandle) => {
    const idx = indexOf(b.id);
    const plain = h.plain();
    const sel = h.selection() ?? { start: plain.length, end: plain.length };
    const list = isList(b.type);
    if (plain === '') {
      // Enter on an empty item steps out: one level up, then back to plain text.
      if (list && (b.indent ?? 0) > 0) commit(replaceAt(idx, { ...b, indent: (b.indent ?? 0) - 1 }), { focus: { id: b.id, at: 0 } });
      else if (b.type !== 'paragraph') commit(replaceAt(idx, block('paragraph', '', { id: b.id })), { focus: { id: b.id, at: 0 } });
      else insertAfter(b.id);
      return;
    }
    const sibling = (text: string) => (list ? blockOfType(b.type, text, { indent: b.indent }) : block('paragraph', text));
    if (sel.start === 0 && sel.end === 0) {
      // At the very start the block moves down and an empty line opens above it.
      commit([...all().slice(0, idx), sibling(''), ...all().slice(idx)], { focus: { id: b.id, at: 0 } });
      return;
    }
    const [left, right] = h.splitAt(sel.start, sel.end);
    const nb = sibling(right);
    commit(replaceAt(idx, withText(b, left), nb), { focus: { id: nb.id, at: 0 } });
  };

  const backspaceAtStart = (b: Block) => {
    const idx = indexOf(b.id);
    if (isList(b.type) && (b.indent ?? 0) > 0) {
      commit(replaceAt(idx, { ...b, indent: (b.indent ?? 0) - 1 }), { focus: { id: b.id, at: 0 } });
      return;
    }
    if (b.type !== 'paragraph') {
      commit(replaceAt(idx, block('paragraph', textOf(b), { id: b.id })), { focus: { id: b.id, at: 0 } });
      return;
    }
    const prev = all()[idx - 1];
    if (!prev) return;
    const without = all().filter(x => x.id !== prev.id);
    if (prev.type === 'divider' || imageOf(prev)) {
      commit(without, { focus: { id: b.id, at: 0 } });
    } else if (isText(prev.type)) {
      const at = textLength(textOf(prev));
      commit(all().filter(x => x.id !== b.id).map(x => (x.id === prev.id ? withText(prev, textOf(prev) + b.text) : x)), { focus: { id: prev.id, at } });
    } else if (b.text === '') {
      commit(all().filter(x => x.id !== b.id), { focus: { id: prev.id, at: 'end' } });
    } else {
      focusNow({ id: prev.id, at: 'end' });
    }
  };

  const deleteAtEnd = (b: Block, at: number) => {
    const idx = indexOf(b.id);
    const next = all()[idx + 1];
    if (!next) return;
    const without = all().filter(x => x.id !== next.id);
    if (next.type === 'divider' || imageOf(next)) commit(without, { focus: { id: b.id, at } });
    else if (isText(next.type)) commit(without.map(x => (x.id === b.id ? withText(b, textOf(b) + textOf(next)) : x)), { focus: { id: b.id, at } });
  };

  /** Moves the caret into a neighbouring block, keeping its horizontal position. */
  const moveInto = (target: Block, line: 'first' | 'last', x: number) => {
    const h = handles.current.get(target.id);
    if (h) h.focusAtX(x, line);
    else focusNow({ id: target.id, at: line === 'first' ? 'start' : 'end' });
  };

  const stepFrom = (id: string, delta: -1 | 1) => {
    const target = all()[indexOf(id) + delta];
    if (target) focusNow({ id: target.id, at: delta < 0 ? 'end' : 'start' });
  };

  const openLinkEditor = (id: string) => {
    const h = handles.current.get(id);
    const sel = h?.selection();
    if (!h || !sel) return;
    const range = sel.start === sel.end ? h.linkAt(sel.start) : { start: sel.start, end: sel.end, dest: h.activeMarks().a ?? '' };
    if (!range) return;
    if (!format) {
      const r = h.caretRect() ?? h.el.getBoundingClientRect();
      setFormat({ blockId: id, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, marks: h.activeMarks() });
    }
    setLink({ blockId: id, start: range.start, end: range.end, value: hrefOf(range.dest) });
  };

  const onTextKey = (id: string, e: React.KeyboardEvent<HTMLDivElement>, h: EditableHandle) => {
    if (e.nativeEvent.isComposing) return;
    const idx = indexOf(id);
    if (idx === -1) return;
    const b = all()[idx];
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const stop = () => e.preventDefault();

    if (slash && slash.blockId === id) {
      if (e.key === 'Escape') {
        stop();
        setSlash(null);
        // A lone slash (the + button's, or one typed into an empty line) goes away with its
        // menu; inside text it stays as a plain character and the menu keeps quiet about it.
        if (h.plain() === '/') { slashDismissed.current = null; updateBlock(id, { text: '' }); }
        else slashDismissed.current = { blockId: id, start: slash.start };
        return;
      }
      if (slashMatches.length > 0) {
        if (e.key === 'ArrowDown') { stop(); setSlashIndex(i => (i + 1) % slashMatches.length); return; }
        if (e.key === 'ArrowUp') { stop(); setSlashIndex(i => (i - 1 + slashMatches.length) % slashMatches.length); return; }
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
          stop();
          void runSlashItem(slashMatches[Math.min(slashIndex, slashMatches.length - 1)]);
          return;
        }
      }
    }

    if (e.key === 'Escape') { stop(); selectRange(id, id); return; }

    if (e.key === 'Backspace') {
      const sel = h.selection();
      if (sel && sel.start === 0 && sel.end === 0) { stop(); backspaceAtStart(b); }
      return;
    }
    if (e.key === 'Delete') {
      const sel = h.selection();
      const len = h.plain().length;
      if (sel && sel.start === len && sel.end === len) { stop(); deleteAtEnd(b, len); }
      return;
    }

    if (mod) {
      // Physical keys (`code`), so shortcuts keep working on an Arabic keyboard layout.
      const c = e.code;
      const mark = (key: MarkKey) => { stop(); h.toggleMark(key); };
      if (c === 'KeyZ') { stop(); if (e.shiftKey) redo(); else undo(); }
      else if (c === 'KeyY') { stop(); redo(); }
      else if (c === 'KeyB' && !e.shiftKey) mark('b');
      else if (c === 'KeyI' && !e.shiftKey) mark('i');
      else if (c === 'KeyE' && !e.shiftKey) mark('c');
      else if ((c === 'KeyS' || c === 'KeyX') && e.shiftKey) mark('s');
      else if (c === 'KeyK' && !e.shiftKey) {
        // With text selected (or the caret in a link) Ctrl+K edits the link; otherwise it is
        // left for the app's command palette.
        const sel = h.selection();
        if (sel && (sel.start !== sel.end || h.linkAt(sel.start))) { stop(); e.stopPropagation(); openLinkEditor(id); }
      }
      else if (c === 'KeyV' && e.shiftKey) {
        // The webview still fires the paste; this only marks it as plain text.
        plainPaste.current = true;
        window.setTimeout(() => { plainPaste.current = false; }, 200);
      }
      else if (c === 'KeyD' && !e.shiftKey) { stop(); duplicate([id], false); }
      else if (c === 'KeyA' && !e.shiftKey) {
        // The first Ctrl+A selects the block's text; the next one selects every block.
        const sel = h.selection();
        const len = h.plain().length;
        if (!sel || len === 0 || (sel.start === 0 && sel.end === len)) { stop(); selectRange(all()[0].id, all()[all().length - 1].id); }
      }
      else if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        stop();
        const sel = h.selection();
        nudge([id], e.key === 'ArrowUp' ? -1 : 1, { id, at: sel?.start, end: sel?.end });
      }
      else if (e.key === 'Enter') { stop(); if (b.type === 'todo') updateBlock(id, { checked: !b.checked }, false); }
      else if (e.shiftKey && DIGIT_TYPES[c]) { stop(); convertBlock(id, DIGIT_TYPES[c]); }
      return;
    }

    if (e.key === 'Enter') {
      stop();
      if (e.shiftKey) h.insert([{ text: '\n' }]);
      else enter(b, h);
      return;
    }

    if (e.key === 'Tab') {
      stop();
      if (isList(b.type)) {
        const sel = h.selection();
        indentBy([id], e.shiftKey ? -1 : 1, { id, at: sel?.start, end: sel?.end });
      }
      return;
    }

    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
      const up = e.key === 'ArrowUp';
      const sel = h.selection();
      const neighbour = all()[idx + (up ? -1 : 1)];
      if (!sel || !neighbour) return;
      if (e.shiftKey) {
        // Extending past the block's edge switches to selecting whole blocks.
        const edge = sel.backward || sel.start === sel.end ? sel.start : sel.end;
        if (up ? edge === 0 : edge === h.plain().length) { stop(); selectRange(id, neighbour.id); }
        return;
      }
      if (up ? h.onFirstLine() : h.onLastLine()) {
        stop();
        const r = h.caretRect();
        const box = h.el.getBoundingClientRect();
        moveInto(neighbour, up ? 'last' : 'first', r ? r.left : getComputedStyle(h.el).direction === 'rtl' ? box.right : box.left);
      }
      return;
    }

    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.altKey) {
      const sel = h.selection();
      if (!sel || sel.start !== sel.end) return;
      // In right-to-left text the left arrow moves forward.
      const forward = (e.key === 'ArrowRight') !== (getComputedStyle(h.el).direction === 'rtl');
      if (!forward && sel.start === 0 && all()[idx - 1]) { stop(); stepFrom(id, -1); }
      else if (forward && sel.end === h.plain().length && all()[idx + 1]) { stop(); stepFrom(id, 1); }
    }
  };

  const onTextPaste = (id: string, raw: string, h: EditableHandle) => {
    const idx = indexOf(id);
    const text = raw.replace(/\r\n?/g, '\n');
    if (idx === -1 || !text) return;
    if (plainPaste.current) {
      plainPaste.current = false;
      h.insert([{ text }]);
      return;
    }
    const b = all()[idx];
    const len = h.plain().length;
    const sel = h.selection() ?? { start: len, end: len };
    // A link pasted over selected text links that text.
    if (sel.start !== sel.end && /^(https?:\/\/|mailto:)\S+$/.test(text.trim())) { h.setLink(sel.start, sel.end, text.trim()); return; }

    const parsed = parseMarkdownBlocks(text);
    const blank = len === 0 && b.type === 'paragraph';
    const inline = parsed.length === 1 && (parsed[0].type === 'paragraph' ? !imageOf(parsed[0]) || !blank : !blank);
    if (inline) {
      // One line into existing text: its markdown formatting comes along, block markers stay literal.
      h.insert(mdToRuns(text.replace(/\n+$/, '')));
      return;
    }

    const [left, right] = h.splitAt(sel.start, sel.end);
    let out: Block[];
    if (blank) out = parsed;
    else if (parsed[0].type === 'paragraph' && !imageOf(parsed[0])) out = [withText(b, left + parsed[0].text), ...parsed.slice(1)];
    else out = [...(left ? [withText(b, left)] : []), ...parsed];
    const last = out[out.length - 1];
    let focus: Focus = { id: last.id, at: 'end' };
    if (right) {
      if (isText(last.type) && !imageOf(last)) {
        focus = { id: last.id, at: textLength(textOf(last)) };
        out[out.length - 1] = withText(last, textOf(last) + right);
      } else {
        const tail = block('paragraph', right);
        out.push(tail);
        focus = { id: tail.id, at: 0 };
      }
    }
    commit(replaceAt(idx, ...out), { focus });
  };

  // One stable object for every block; the callbacks always see the latest render.
  const impl = useRef<Omit<EditableHub, 'register'>>(null!);
  impl.current = {
    onChange: onTextChange,
    onKeyDown: onTextKey,
    onFocus: id => {
      focusedRef.current = id;
      if (selected) setSelected(null);
    },
    onBlur: id => {
      if (focusedRef.current === id) focusedRef.current = null;
      setSlash(null);
    },
    onPaste: onTextPaste,
    onUndo: undo,
    onRedo: redo,
    onOpenLink: href => { if (href) void openUrl(href).catch(() => window.open(href, '_blank', 'noopener')); },
  };
  const hub = useMemo<EditableHub>(() => ({
    register: (id, handle) => { if (handle) handles.current.set(id, handle); else handles.current.delete(id); },
    onChange: (...a) => impl.current.onChange(...a),
    onKeyDown: (...a) => impl.current.onKeyDown(...a),
    onFocus: id => impl.current.onFocus(id),
    onBlur: id => impl.current.onBlur(id),
    onPaste: (...a) => impl.current.onPaste(...a),
    onUndo: () => impl.current.onUndo(),
    onRedo: () => impl.current.onRedo(),
    onOpenLink: href => impl.current.onOpenLink(href),
  }), []);

  /* ─── Text actions (selection toolbar, right-click menu) ────────────── */

  /** Copies the selected text as markdown; `cut` also removes it. */
  const copyText = (id: string, cut: boolean) => {
    const h = handles.current.get(id);
    const sel = h?.selection();
    if (!h || !sel || sel.start === sel.end) return;
    const runs = h.runs();
    navigator.clipboard.writeText(runsToMd(sliceRuns(runs, sel.start, sel.end))).catch(() => {});
    if (cut) h.setRuns(replaceRange(runs, sel.start, sel.end, []), sel.start);
  };

  const pasteText = async (id: string, plain: boolean) => {
    const h = handles.current.get(id);
    if (!h) return;
    let text: string | null = null;
    try { text = await navigator.clipboard.readText(); } catch { /* clipboard read not allowed */ }
    if (text === null) {
      // Let the webview paste instead; the text arrives through onPaste.
      plainPaste.current = plain;
      if (!document.execCommand('paste')) plainPaste.current = false;
      return;
    }
    if (!text) return;
    plainPaste.current = plain;
    onTextPaste(id, text, h);
  };

  const openTextMenu = (id: string, x: number, y: number) => {
    const h = handles.current.get(id);
    if (!h) return;
    const len = h.plain().length;
    const sel = h.selection() ?? { start: len, end: len };
    setSlash(null);
    setMenu(null);
    setFormat(null);
    setTextMenu({
      blockId: id, x, y, start: sel.start, end: sel.end,
      marks: h.selection() ? h.activeMarks() : {},
      canLink: sel.start !== sel.end || !!h.linkAt(sel.start),
    });
  };

  const runTextAction = (action: TextAction) => {
    const m = textMenuRef.current;
    if (!m) return;
    textMenuRef.current = null;
    setTextMenu(null);
    const h = handles.current.get(m.blockId);
    if (!h) return;
    if (action === 'block') { setMenu({ blockId: m.blockId, x: m.x, y: m.y }); return; }
    // Put back the selection the menu was opened on.
    h.focus(m.start, m.end);
    if (action === 'cut' || action === 'copy') copyText(m.blockId, action === 'cut');
    else if (action === 'paste' || action === 'pastePlain') void pasteText(m.blockId, action === 'pastePlain');
    else if (action === 'selectAll') h.focus(0, h.plain().length);
    else if (action === 'link') openLinkEditor(m.blockId);
    else h.toggleMark(action);
  };

  /* ─── Selection toolbar ─────────────────────────────────────────────── */

  useEffect(() => {
    let mouseDown = false;
    const update = () => {
      if (linkRef.current || textMenuRef.current) return;
      const sel = window.getSelection();
      const anchor = sel?.anchorNode;
      const host = anchor && rootRef.current?.contains(anchor)
        ? (anchor instanceof Element ? anchor : anchor.parentElement)?.closest<HTMLElement>('[data-editable]')
        : null;
      const h = host ? handles.current.get(host.dataset.editable ?? '') : null;
      if (!sel || sel.isCollapsed || !host || !h) { setFormat(null); return; }
      // While the mouse is still dragging, the toolbar would sit under the pointer.
      if (mouseDown) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) { setFormat(null); return; }
      setFormat({ blockId: host.dataset.editable!, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, marks: h.activeMarks() });
    };
    const onSelection = () => {
      update();
      const id = focusedRef.current;
      if (slashRef.current && id) refreshSlash(id);
    };
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('.format-toolbar')) return;
      mouseDown = true;
      setFormat(null);
    };
    const onUp = () => { mouseDown = false; window.setTimeout(update, 0); };
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('scroll', update, true);
    return () => {
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('scroll', update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Keys while whole blocks are selected, and editor-wide shortcuts ── */

  const onRootKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const stop = () => e.preventDefault();
    if (mod && e.code === 'KeyZ') { stop(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.code === 'KeyY') { stop(); redo(); return; }
    if (!selRange || e.target !== e.currentTarget) return;

    const list = all();
    const ids = selectedIds;
    if (e.key === 'Escape') { stop(); setSelected(null); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      stop();
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      if (mod && e.shiftKey) { nudge(ids, delta); return; }
      const target = list[Math.max(0, Math.min(list.length - 1, selRange.focus + delta))];
      if (e.shiftKey) selectRange(selected!.anchor, target.id);
      else selectRange(target.id, target.id);
      return;
    }
    if (e.key === 'Enter') { stop(); setSelected(null); focusNow({ id: list[selRange.focus].id, at: 'end' }); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { stop(); setSelected(null); removeBlocks(ids); return; }
    if (e.key === 'Tab') { stop(); indentBy(ids, e.shiftKey ? -1 : 1); return; }
    if (mod && e.code === 'KeyA') { stop(); selectRange(list[0].id, list[list.length - 1].id); return; }
    if (mod && e.code === 'KeyD') { stop(); duplicate(ids, true); return; }
    if (mod && e.code === 'KeyC') { stop(); copyBlocks(ids); return; }
    if (mod && e.code === 'KeyX') { stop(); copyBlocks(ids); setSelected(null); removeBlocks(ids); return; }
    if (mod && e.shiftKey && DIGIT_TYPES[e.code] && ids.length === 1) { stop(); setSelected(null); convertBlock(ids[0], DIGIT_TYPES[e.code]); }
  };

  /* ─── Mouse: selecting across blocks, clicking the margins ──────────── */

  const rowAtY = (clientY: number): string | null => {
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-block-row]') ?? []);
    let best: { id: string; d: number } | null = null;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      const d = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
      if (!best || d < best.d) best = { id: row.dataset.blockRow!, d };
      if (d === 0) break;
    }
    return best?.id ?? null;
  };

  const onRootMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.block-editor-controls')) return;
    const row = target.closest<HTMLElement>('[data-block-row]')?.dataset.blockRow ?? null;

    // Shift+click on another block selects everything in between.
    const from = selected?.anchor ?? focusedRef.current;
    if (e.shiftKey && row && from && from !== row) { e.preventDefault(); selectRange(from, row); return; }
    if (selected) setSelected(null);

    const anchor = row ?? rowAtY(e.clientY);
    if (!anchor) return;
    const startY = e.clientY;
    let active = false;
    const move = (ev: MouseEvent) => {
      const over = rowAtY(ev.clientY);
      if (!over) return;
      // Inside the block it started in, a drag selects text as usual.
      if (!active && (row ? over === row : Math.abs(ev.clientY - startY) < 6)) return;
      if (!active) {
        active = true;
        rootRef.current?.classList.add('is-block-selecting');
      }
      selectRange(anchor, over);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      rootRef.current?.classList.remove('is-block-selecting');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // A click beside or below the text lands in the nearest block (a new one after the last).
  const onRootClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || selected) return;
    const list = all();
    const last = list[list.length - 1];
    const lastRow = rootRef.current?.querySelector(`[data-block-row="${last.id}"]`)?.getBoundingClientRect();
    if (lastRow && e.clientY > lastRow.bottom) {
      if (last.type === 'paragraph' && last.text === '') focusNow({ id: last.id });
      else insertAfter(last.id);
      return;
    }
    const id = rowAtY(e.clientY);
    if (id) focusNow({ id, at: 'end' });
  };

  /* ─── Drag and drop ─────────────────────────────────────────────────── */

  // Nearest gap to the pointer: before the first row whose middle is below it, else after the last.
  const dropSlotAt = (clientY: number): number => {
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
  const endDrag = () => { dragActive.current = false; setDraggingIds(null); setDropSlot(null); };

  const typeLabel = (type: BlockType) => t(`blocks.types.${type}`);

  // A small floating card under the cursor instead of the browser's translucent screenshot.
  const startDrag = (e: React.DragEvent, b: Block) => {
    const ids = selectedIds.includes(b.id) ? selectedIds : [b.id];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(BLOCK_MIME, b.id);
    // The padded outer box leaves room for the card's shadow (drag images clip to the element).
    const ghost = document.createElement('div');
    ghost.className = 'block-drag-ghost';
    const card = document.createElement('div');
    card.className = 'block-drag-ghost-card';
    card.dir = 'auto';
    ghost.appendChild(card);
    const label = document.createElement('span');
    label.className = 'block-drag-ghost-type';
    label.textContent = ids.length > 1 ? t('blocks.count', { count: ids.length }) : typeLabel(b.type);
    const text = document.createElement('span');
    text.className = `block-drag-ghost-text${b.type.startsWith('heading') ? ' heading' : ''}`;
    const plain = b.type === 'code' ? parseCodeText(b.text).code : plainOf(mdToRuns(textOf(b)));
    text.textContent = imageOf(b) ? typeLabel('paragraph') : plain.replace(/\s+/g, ' ').trim().slice(0, 90) || typeLabel(b.type);
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
      setDraggingIds(ids);
      setSlash(null);
      setMenu(null);
    });
  };

  const dragFrom = draggingIds ? blocks.findIndex(b => b.id === draggingIds[0]) : -1;
  const dragTo = draggingIds ? blocks.findIndex(b => b.id === draggingIds[draggingIds.length - 1]) : -1;
  // Dropping right next to itself changes nothing, so no indicator there.
  const activeSlot = dropSlot !== null && (dropSlot < dragFrom || dropSlot > dragTo + 1) ? dropSlot : null;

  /* ─── Block menu ────────────────────────────────────────────────────── */

  // The menu closes on any outside mousedown, which includes its own trigger; without this
  // a second click on the handle would close and immediately reopen it.
  const lastClosed = useRef<{ blockId: string; at: number } | null>(null);
  const closeMenu = () => {
    if (menu) lastClosed.current = { blockId: menu.blockId, at: Date.now() };
    setMenu(null);
  };
  const openMenuAt = (blockId: string, button: HTMLElement) => {
    const closed = lastClosed.current;
    if (closed?.blockId === blockId && Date.now() - closed.at < 400) { lastClosed.current = null; return; }
    if (menu?.blockId === blockId) { closeMenu(); return; }
    const r = button.getBoundingClientRect();
    setSlash(null);
    setMenu({ blockId, x: uiDir === 'rtl' ? r.right - 240 : r.left, y: r.bottom + 4 });
  };
  const menuIds = menu ? (selectedIds.includes(menu.blockId) ? selectedIds : [menu.blockId]) : [];

  /** The + button: a new line below (above with Alt) with the block menu open. */
  const addNear = (b: Block, above: boolean) => {
    setSelected(null);
    if (b.type === 'paragraph' && b.text === '') {
      commit(replaceAt(indexOf(b.id), { ...b, text: '/' }), { focus: { id: b.id, at: 'end', slash: true } });
      return;
    }
    const nb = block('paragraph', '/');
    const idx = indexOf(b.id) + (above ? 0 : 1);
    slashDismissed.current = null;
    commit([...all().slice(0, idx), nb, ...all().slice(idx)], { focus: { id: nb.id, at: 'end', slash: true } });
  };

  const openImage = (b: Block, alt: string, src: string) => {
    const edit = () => setRawImage(b.id);
    if (!images) { edit(); return; }
    images.openViewer({ src, alt, onEdit: edit, onReplaceSrc: next => updateBlock(b.id, { text: `![${alt}](${next})` }, false) });
  };

  /* ─── Render ────────────────────────────────────────────────────────── */

  // A `/command` being typed is not part of the writing: an Arabic search word must not flip
  // an English line (and the menu hanging from it) to the other side.
  const dirs = blockDirs(slash ? blocks.map(b => {
    if (b.id !== slash.blockId) return b;
    const text = textOf(b);
    const at = text.lastIndexOf(`/${slash.query}`);
    return at === -1 ? b : withText(b, text.slice(0, at) + text.slice(at + slash.query.length + 1));
  }) : blocks, uiDir);
  const numbers = listNumbers(blocks);
  const solo = blocks.length === 1;

  const placeholderFor = (b: Block) => {
    if (b.type === 'paragraph') return t('blocks.placeholder');
    if (b.type === 'bullet' || b.type === 'numbered') return t('blocks.listPlaceholder');
    if (b.type === 'todo') return t('blocks.todoPlaceholder');
    if (b.type === 'quote') return t('blocks.quotePlaceholder');
    if (b.type === 'callout') return t('blocks.calloutPlaceholder');
    return typeLabel(b.type);
  };

  const slashBlock = slash ? blocks.findIndex(b => b.id === slash.blockId) : -1;

  return (
    <div
      ref={rootRef}
      className={`block-editor${draggingIds ? ' is-dragging' : ''}`}
      style={editorStyle}
      tabIndex={-1}
      onKeyDown={onRootKey}
      onMouseDown={onRootMouseDown}
      onClick={onRootClick}
      onPaste={e => {
        if (!selRange || e.target !== e.currentTarget) return;
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
        if (!text.trim()) return;
        const parsed = parseMarkdownBlocks(text);
        commit([...all().slice(0, selRange.hi + 1), ...parsed, ...all().slice(selRange.hi + 1)]);
        setSelected({ anchor: parsed[0].id, focus: parsed[parsed.length - 1].id });
      }}
      onDragOver={e => {
        if (!draggingIds || !e.dataTransfer.types.includes(BLOCK_MIME)) return;
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
        if (!draggingIds || !e.dataTransfer.types.includes(BLOCK_MIME)) return;
        e.preventDefault();
        if (moveTo(draggingIds, dropSlotAt(e.clientY))) setJustDropped(draggingIds);
        endDrag();
      }}
    >
      {blocks.map((b, index) => {
        const dir = dirs[index];
        const textStyle = blockTextStyle(b.type, editorStyle);
        const img = imageOf(b);
        const line = firstLine(img ? 'image' : b.type, textStyle);
        const isSelected = selRange !== null && index >= selRange.lo && index <= selRange.hi;
        const shellKeys = (e: React.KeyboardEvent, onEnter: () => void) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); stepFrom(b.id, -1); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); stepFrom(b.id, 1); }
          else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeBlocks([b.id]); }
          else if (e.key === 'Escape') { e.preventDefault(); selectRange(b.id, b.id); }
        };
        const callout = b.type === 'callout' ? calloutParts(b.text) : null;

        return (
          <div
            key={b.id}
            data-block-row={b.id}
            data-type={img ? 'image' : b.type}
            className={`block-editor-row${draggingIds?.includes(b.id) ? ' dragging' : ''}${justDropped?.includes(b.id) ? ' just-dropped' : ''}${menu && menuIds.includes(b.id) ? ' menu-open' : ''}${isSelected ? ' selected' : ''}`}
            // Side buttons and list markers centre on the first line (see firstLine).
            style={{ '--line-top': `${line.top}px`, '--line-h': `${line.height}px`, '--indent': b.indent ?? 0 } as React.CSSProperties}
            // Right-click in text opens the text menu; elsewhere in the row, the block menu.
            // Shift+right-click keeps the native menu (spell-check suggestions).
            onContextMenu={e => {
              if (e.shiftKey) return;
              const host = (e.target as HTMLElement).closest<HTMLElement>('[data-editable]');
              if (host && handles.current.has(host.dataset.editable ?? '')) {
                e.preventDefault();
                openTextMenu(host.dataset.editable!, e.clientX, e.clientY);
                return;
              }
              // Code and table fields keep the native menu for their own text.
              if ((e.target as HTMLElement).closest('textarea, input')) return;
              e.preventDefault();
              setSlash(null);
              setMenu({ blockId: b.id, x: e.clientX, y: e.clientY });
            }}
          >
            {activeSlot === index && <div className="block-drop-indicator before" aria-hidden="true" />}
            {activeSlot === blocks.length && index === blocks.length - 1 && <div className="block-drop-indicator after" aria-hidden="true" />}
            <div className="block-editor-controls">
              <button
                type="button"
                className="block-editor-add"
                onMouseDown={e => e.preventDefault()}
                onClick={e => addNear(b, e.altKey)}
                title={t('blocks.addHint')}
                aria-label={t('blocks.add')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                draggable
                onDragStart={e => startDrag(e, b)}
                onDragEnd={endDrag}
                onKeyDown={e => {
                  // Keyboard reordering: focus the handle, then Arrow Up / Down.
                  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                  e.preventDefault();
                  e.stopPropagation();
                  nudge([b.id], e.key === 'ArrowUp' ? -1 : 1);
                  window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-block-row="${b.id}"] .block-editor-handle`)?.focus(), 0);
                }}
                // A click without dragging opens the block menu (drag never fires click).
                onClick={e => openMenuAt(b.id, e.currentTarget)}
                className="block-editor-handle"
                title={t('blocks.handleHint')}
                aria-label={t('blocks.handle')}
                aria-haspopup="menu"
                aria-expanded={menu?.blockId === b.id}
              >
                <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                  <circle cx="3" cy="3" r="1.4" /><circle cx="7" cy="3" r="1.4" />
                  <circle cx="3" cy="8" r="1.4" /><circle cx="7" cy="8" r="1.4" />
                  <circle cx="3" cy="13" r="1.4" /><circle cx="7" cy="13" r="1.4" />
                </svg>
              </button>
            </div>

            <div className="block-editor-content" dir={dir}>
              {b.type === 'divider' ? (
                <div
                  className="divider-block"
                  tabIndex={0}
                  role="separator"
                  data-block-input={b.id}
                  onKeyDown={e => shellKeys(e, () => insertAfter(b.id))}
                >
                  <hr className="divider-line" />
                </div>
              ) : b.type === 'table' ? (
                <TableBlock
                  blockId={b.id}
                  text={b.text}
                  editorStyle={editorStyle}
                  isEditing={editingTable === b.id}
                  onEnterEdit={() => { setSelected(null); setEditingTable(b.id); }}
                  onBlur={() => setEditingTable(id => (id === b.id ? null : id))}
                  onChange={v => updateBlock(b.id, { text: v })}
                  onNavigate={delta => { setEditingTable(null); stepFrom(b.id, delta); }}
                  onRemove={() => removeBlocks([b.id])}
                  onEscape={() => { setEditingTable(null); selectRange(b.id, b.id); }}
                />
              ) : b.type === 'code' ? (
                <CodeBlock
                  blockId={b.id}
                  text={b.text}
                  onFocus={() => { focusedRef.current = b.id; setSlash(null); if (selected) setSelected(null); }}
                  onChange={v => updateBlock(b.id, { text: v })}
                  onExit={() => insertAfter(b.id)}
                  onNavigate={delta => stepFrom(b.id, delta)}
                  onRemove={() => convertBlock(b.id, 'paragraph')}
                  onEscape={() => selectRange(b.id, b.id)}
                />
              ) : img && rawImage === b.id ? (
                <input
                  autoFocus
                  dir="ltr"
                  className="image-raw-input"
                  value={b.text}
                  aria-label={typeLabel('paragraph')}
                  onChange={e => updateBlock(b.id, { text: e.target.value })}
                  onBlur={() => setRawImage(null)}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setRawImage(null); pending.current = { id: b.id }; }
                  }}
                />
              ) : img ? (
                <div
                  className="image-block"
                  tabIndex={0}
                  data-block-input={b.id}
                  onClick={() => openImage(b, img[1], img[2])}
                  onKeyDown={e => {
                    if (e.key === ' ') { e.preventDefault(); openImage(b, img[1], img[2]); return; }
                    shellKeys(e, () => insertAfter(b.id));
                  }}
                >
                  <ResolvedImg src={img[2]} alt={img[1]} className="image-block-img" onOpen={() => openImage(b, img[1], img[2])} />
                </div>
              ) : (
                <div className={`block-body block-body-${b.type}${b.type === 'todo' && b.checked ? ' checked' : ''}`}>
                  {b.type === 'bullet' && <span key="marker" className="block-marker" aria-hidden="true">{BULLETS[(b.indent ?? 0) % BULLETS.length]}</span>}
                  {b.type === 'numbered' && <span key="marker" className="block-marker block-marker-number" aria-hidden="true">{numbers[index] ?? 1}.</span>}
                  {b.type === 'todo' && (
                    <button
                      key="marker"
                      type="button"
                      role="checkbox"
                      aria-checked={!!b.checked}
                      aria-label={typeLabel('todo')}
                      className="block-todo-box"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => updateBlock(b.id, { checked: !b.checked }, false)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </button>
                  )}
                  {callout && (
                    <button
                      key="marker"
                      type="button"
                      className="callout-emoji-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        const cycle = <T,>(items: readonly T[], current: T) => items[(items.indexOf(current) + 1) % items.length];
                        const head = callout.jsxType ? `type:${cycle(CALLOUT_JSX_TYPES, callout.jsxType)}` : cycle(CALLOUT_EMOJI, callout.emoji);
                        updateBlock(b.id, { text: `${head}\n${callout.content}` }, false);
                      }}
                      title={t('blocks.calloutChange')}
                      aria-label={t('blocks.calloutChange')}
                    >
                      {callout.emoji}
                      {callout.jsxType && <span className="callout-type-badge">{callout.jsxType}</span>}
                    </button>
                  )}
                  <EditableText
                    key="text"
                    blockId={b.id}
                    text={textOf(b)}
                    dir={dir}
                    className={`block-text block-${b.type}${solo ? ' placeholder-always' : ''}`}
                    style={textStyle}
                    placeholder={placeholderFor(b)}
                    hub={hub}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {slash && slashBlock !== -1 && (slashMatches.length > 0 || slash.query !== '') && (
        <SlashMenu
          items={slashMatches}
          active={Math.min(slashIndex, Math.max(0, slashMatches.length - 1))}
          query={slash.query}
          anchor={slash.anchor}
          dir={dirs[slashBlock]}
          onHover={setSlashIndex}
          onPick={item => void runSlashItem(item)}
        />
      )}

      {(format || link) && (() => {
        const id = (link ?? format)!.blockId;
        const h = handles.current.get(id);
        if (!h || !format) return null;
        return (
          <FormatToolbar
            state={format}
            link={link ? link.value : null}
            onToggle={key => h.toggleMark(key)}
            onCopy={() => copyText(id, false)}
            onCut={() => copyText(id, true)}
            onMore={button => {
              const r = button.getBoundingClientRect();
              openTextMenu(id, uiDir === 'rtl' ? r.right - 240 : r.left, r.bottom + 6);
            }}
            onLinkOpen={() => openLinkEditor(id)}
            onLinkChange={v => setLink(l => (l ? { ...l, value: v } : l))}
            onLinkApply={() => {
              const l = linkRef.current;
              if (!l) return;
              linkRef.current = null;
              setLink(null);
              h.setLink(l.start, l.end, l.value.trim() || null);
            }}
            onLinkCancel={() => {
              const l = linkRef.current;
              if (!l) return;
              linkRef.current = null;
              setLink(null);
              // Esc returns to the text; a click elsewhere has already moved the focus.
              if (document.activeElement?.classList.contains('format-toolbar-link')) h.focus(l.start, l.end);
            }}
          />
        );
      })()}

      {textMenu && (
        <TextContextMenu
          x={textMenu.x}
          y={textMenu.y}
          hasSelection={textMenu.start !== textMenu.end}
          marks={textMenu.marks}
          canLink={textMenu.canLink}
          onAction={runTextAction}
          onClose={() => { textMenuRef.current = null; setTextMenu(null); }}
        />
      )}

      {menu && (() => {
        const target = blocks.find(b => b.id === menu.blockId);
        if (!target) return null;
        const done = () => { setMenu(null); };
        return (
          <BlockContextMenu
            x={menu.x}
            y={menu.y}
            type={target.type}
            count={menuIds.length}
            onClose={closeMenu}
            onTurnInto={type => { done(); setSelected(null); convertBlock(target.id, type); }}
            onInsertBelow={() => { done(); setSelected(null); insertAfter(menuIds[menuIds.length - 1]); }}
            onDuplicate={() => { done(); duplicate(menuIds, menuIds.length > 1); }}
            onCopy={() => { done(); copyBlocks(menuIds); }}
            onDelete={() => { done(); setSelected(null); removeBlocks(menuIds); }}
          />
        );
      })()}
    </div>
  );
}

const toPx = (v: string | number | undefined, fallback: number) => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Where a block's first line sits inside its row, so the side buttons can centre on it:
 * `top` is the space above that line, `height` its line box. Values follow the block CSS
 * (content padding 3px, callout 12px + border, ...).
 */
function firstLine(type: BlockType | 'image', textStyle: React.CSSProperties): { top: number; height: number } {
  const size = toPx(textStyle.fontSize, 15);
  const lh = textStyle.lineHeight;
  // Unitless line height is a multiple of the font size; '28px' is absolute.
  const line = typeof lh === 'string' && lh.endsWith('px') ? toPx(lh, size * 1.6) : size * toPx(lh, 1.6);
  switch (type) {
    case 'callout': return { top: 3 + 13, height: line };
    case 'code':    return { top: 3 + 1, height: 30 };   // language header row
    case 'table':   return { top: 3 + 3, height: 36 };   // header cells
    case 'divider': return { top: 3, height: 22 };       // the rule, centred in its padding
    case 'image':   return { top: 3 + 4, height: 26 };
    default:        return { top: 3, height: line };
  }
}

function blockTextStyle(type: BlockType, editorStyle: React.CSSProperties): React.CSSProperties {
  const size = toPx(editorStyle.fontSize as string | number | undefined, 16);
  if (type === 'heading1') return { ...editorStyle, fontSize: Math.round(size * 1.875), fontWeight: 700, lineHeight: 1.3 };
  if (type === 'heading2') return { ...editorStyle, fontSize: Math.round(size * 1.5), fontWeight: 650, lineHeight: 1.35 };
  if (type === 'heading3') return { ...editorStyle, fontSize: Math.round(size * 1.25), fontWeight: 650, lineHeight: 1.4 };
  return editorStyle;
}
