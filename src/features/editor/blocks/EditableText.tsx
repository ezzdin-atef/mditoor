import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInlineImages } from '../components/EditorImages';
import {
  caretRect, domToRuns, getOffsets, hrefOf, linkRangeAt, mapOffset, marksAt, mdToRuns, plainOf, rangeHas,
  replaceRange, runsToHtml, runsToMd, setMark, setOffsets, sliceRuns, splitRuns,
  type MarkKey, type Marks, type Run,
} from './inline';
import type { Dir } from './model';

export type CaretPos = number | 'start' | 'end';

/** What the block editor can ask of one block's text. */
export interface EditableHandle {
  el: HTMLDivElement;
  focus: (at?: CaretPos, end?: number) => void;
  /** Puts the caret on the first or last line, as close to screen x as it gets. */
  focusAtX: (x: number, line: 'first' | 'last') => void;
  selection: () => { start: number; end: number; backward: boolean } | null;
  plain: () => string;
  runs: () => Run[];
  /** Markdown before `start` and after `end`. */
  splitAt: (start: number, end: number) => [string, string];
  /** Replaces the text and reports the change. */
  setRuns: (runs: Run[], start: number, end?: number) => void;
  insert: (runs: Run[]) => void;
  toggleMark: (key: MarkKey) => void;
  /** Formatting of the selection, for the toolbar. */
  activeMarks: () => Marks;
  setLink: (start: number, end: number, dest: string | null) => void;
  linkAt: (offset: number) => { start: number; end: number; dest: string } | null;
  caretRect: () => DOMRect | null;
  onFirstLine: () => boolean;
  onLastLine: () => boolean;
}

export interface ChangeInfo {
  plain: string;
  caret: number | null;
  inputType?: string;
  data?: string | null;
}

/** Callbacks shared by every block; the object itself never changes. */
export interface EditableHub {
  register: (id: string, handle: EditableHandle | null) => void;
  onChange: (id: string, md: string, info: ChangeInfo) => void;
  onKeyDown: (id: string, e: React.KeyboardEvent<HTMLDivElement>, handle: EditableHandle) => void;
  onFocus: (id: string) => void;
  onBlur: (id: string) => void;
  onPaste: (id: string, text: string, handle: EditableHandle) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenLink: (href: string) => void;
}

interface Props {
  blockId: string;
  /** Inline markdown. */
  text: string;
  dir: Dir;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  hub: EditableHub;
}

const sameStyle = (a?: React.CSSProperties, b?: React.CSSProperties) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a) as (keyof React.CSSProperties)[];
  return ka.length === Object.keys(b).length && ka.every(k => a[k] === b[k]);
};

const sameMarks = (x: Marks, y: Marks) =>
  !!x.b === !!y.b && !!x.i === !!y.i && !!x.s === !!y.s && !!x.c === !!y.c && (x.a ?? null) === (y.a ?? null);

/**
 * One block's text: a contenteditable that shows formatting instead of markdown markers.
 * The DOM is owned here (React never re-renders its children), so the caret is stable.
 */
export const EditableText = memo(function EditableText({ blockId, text, dir, className, style, placeholder, hub }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Markdown the DOM currently stands for; a different `text` prop means an outside change.
  const shown = useRef<string | null>(null);
  // Formatting for the next typed characters (after Ctrl+B with no selection, or closing `**`).
  const stored = useRef<{ marks: Marks; at: number } | null>(null);
  const composing = useRef(false);
  const [imgKey, setImgKey] = useState(0);
  useInlineImages(ref, String(imgKey));

  const paint = (runs: Run[]) => {
    const el = ref.current!;
    el.innerHTML = runsToHtml(runs);
    el.toggleAttribute('data-empty', runs.length === 0);
    // Inline images are resolved against the workspace after each repaint.
    if (runs.some(r => r.img)) setImgKey(k => k + 1);
  };

  const report = (md: string, plain: string, caret: number | null, info: Partial<ChangeInfo> = {}) => {
    shown.current = md;
    ref.current!.toggleAttribute('data-empty', plain === '');
    hub.onChange(blockId, md, { plain, caret, ...info });
  };

  /** Shows `runs`, puts the selection back, and reports the new markdown. */
  const apply = (runs: Run[], start: number, end = start, info: Partial<ChangeInfo> = {}) => {
    const el = ref.current!;
    const md = runsToMd(runs);
    const canon = mdToRuns(md);
    paint(canon);
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    setOffsets(el, start, end);
    report(md, plainOf(canon), end, info);
  };

  const handle = useRef<EditableHandle>(null!);
  if (!handle.current) {
    const el = () => ref.current!;
    const lineBox = () => {
      const cs = getComputedStyle(el());
      const box = el().getBoundingClientRect();
      const size = parseFloat(cs.fontSize) || 16;
      const lh = parseFloat(cs.lineHeight) || size * 1.5;
      return { top: box.top + (parseFloat(cs.paddingTop) || 0), bottom: box.bottom - (parseFloat(cs.paddingBottom) || 0), lh, box };
    };
    handle.current = {
      get el() { return el(); },
      focus(at = 'end', end) {
        const node = el();
        node.focus();
        const len = plainOf(domToRuns(node)).length;
        const start = at === 'start' ? 0 : at === 'end' ? len : Math.min(at, len);
        setOffsets(node, start, end === undefined ? start : Math.min(end, len));
        stored.current = null;
      },
      focusAtX(x, line) {
        const node = el();
        node.scrollIntoView({ block: 'nearest' });
        node.focus({ preventScroll: true });
        const { top, bottom, lh, box } = lineBox();
        const y = line === 'first' ? top + lh / 2 : bottom - lh / 2;
        const cx = Math.max(box.left + 1, Math.min(x, box.right - 1));
        const doc = document as Document & {
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        };
        let point: [Node, number] | null = null;
        const range = doc.caretRangeFromPoint?.(cx, y);
        if (range) point = [range.startContainer, range.startOffset];
        else {
          const pos = doc.caretPositionFromPoint?.(cx, y);
          if (pos) point = [pos.offsetNode, pos.offset];
        }
        if (point && node.contains(point[0])) window.getSelection()?.setBaseAndExtent(point[0], point[1], point[0], point[1]);
        else setOffsets(node, line === 'first' ? 0 : plainOf(domToRuns(node)).length);
        stored.current = null;
      },
      selection: () => getOffsets(el()),
      plain: () => plainOf(domToRuns(el())),
      runs: () => domToRuns(el()),
      splitAt(start, end) {
        const runs = domToRuns(el());
        return [runsToMd(splitRuns(runs, start)[0]), runsToMd(splitRuns(runs, end)[1])];
      },
      setRuns: (runs, start, end) => apply(runs, start, end),
      insert(insert) {
        const node = el();
        const runs = domToRuns(node);
        const len = plainOf(runs).length;
        const sel = getOffsets(node) ?? { start: len, end: len };
        apply(replaceRange(runs, sel.start, sel.end, insert), sel.start + plainOf(insert).length);
      },
      toggleMark(key) {
        const node = el();
        const sel = getOffsets(node);
        if (!sel) return;
        const runs = domToRuns(node);
        if (sel.start === sel.end) {
          const now = stored.current?.at === sel.start ? stored.current.marks : marksAt(runs, sel.start);
          stored.current = { marks: { ...now, [key]: !now[key] }, at: sel.start };
          return;
        }
        apply(setMark(runs, sel.start, sel.end, { [key]: !rangeHas(runs, sel.start, sel.end, key) }), sel.start, sel.end);
      },
      activeMarks() {
        const node = el();
        const sel = getOffsets(node);
        if (!sel) return {};
        const runs = domToRuns(node);
        if (sel.start === sel.end) return stored.current?.at === sel.start ? stored.current.marks : marksAt(runs, sel.start);
        const inside = sliceRuns(runs, sel.start, sel.end);
        const link = inside.length > 0 && inside.every(r => r.a !== undefined && r.a === inside[0].a) ? inside[0].a : undefined;
        return {
          b: rangeHas(runs, sel.start, sel.end, 'b'), i: rangeHas(runs, sel.start, sel.end, 'i'),
          s: rangeHas(runs, sel.start, sel.end, 's'), c: rangeHas(runs, sel.start, sel.end, 'c'), a: link,
        };
      },
      setLink(start, end, dest) {
        const runs = domToRuns(el());
        const safe = dest && /[\s()]/.test(dest) ? `<${dest}>` : dest;
        if (start === end) {
          if (!safe) return;
          apply(replaceRange(runs, start, start, [{ text: dest!, a: safe }]), start + dest!.length);
          return;
        }
        apply(setMark(runs, start, end, { a: safe ?? undefined }), start, end);
      },
      linkAt: offset => linkRangeAt(domToRuns(el()), offset),
      caretRect: () => caretRect(el()),
      onFirstLine() {
        const r = caretRect(el());
        if (!r) return true;
        const { top, lh } = lineBox();
        return r.top - top < lh * 0.75;
      },
      onLastLine() {
        const r = caretRect(el());
        if (!r) return true;
        const { bottom, lh } = lineBox();
        return bottom - r.bottom < lh * 0.75;
      },
    };
  }

  // Outside changes (undo, split, merge, paste, a block-type shortcut) repaint the text.
  useLayoutEffect(() => {
    const el = ref.current!;
    if (shown.current === text) return;
    const sel = document.activeElement === el ? getOffsets(el) : null;
    const runs = mdToRuns(text);
    paint(runs);
    shown.current = text;
    stored.current = null;
    if (sel) {
      const len = plainOf(runs).length;
      setOffsets(el, Math.min(sel.start, len), Math.min(sel.end, len));
    }
  }, [text]);

  useLayoutEffect(() => {
    hub.register(blockId, handle.current);
    return () => hub.register(blockId, null);
  }, [blockId, hub]);

  /** Reads the text back after the webview edited the DOM. */
  const sync = (info: Partial<ChangeInfo> = {}) => {
    const el = ref.current!;
    const runs = domToRuns(el);
    const md = runsToMd(runs);
    const plain = plainOf(runs);
    const canon = mdToRuns(md);
    const canonPlain = plainOf(canon);
    let caret = getOffsets(el)?.end ?? null;
    // Markers that just became formatting (`**bold**`), or markup the webview invented.
    const formatted = canonPlain !== plain;
    if (formatted || el.querySelector('div, p, span, font, b, i, u')) {
      const typedIn = caret === null ? {} : marksAt(runs, caret);
      if (caret !== null) caret = mapOffset(plain, canonPlain, caret);
      paint(canon);
      if (caret !== null) {
        setOffsets(el, caret);
        // Text typed after the closing marker continues in the surrounding style, not the new one.
        if (formatted) stored.current = { marks: typedIn, at: caret };
      }
    }
    report(md, canonPlain, caret, info);
  };

  useEffect(() => {
    const el = ref.current!;
    const before = (e: InputEvent) => {
      const type = e.inputType;
      if (type === 'historyUndo') { e.preventDefault(); hub.onUndo(); return; }
      if (type === 'historyRedo') { e.preventDefault(); hub.onRedo(); return; }
      // Enter is handled as a key; this covers anything else that would add a paragraph.
      if (type === 'insertParagraph' || type === 'insertLineBreak') { e.preventDefault(); return; }
      if (type === 'formatBold') { e.preventDefault(); handle.current.toggleMark('b'); return; }
      if (type === 'formatItalic') { e.preventDefault(); handle.current.toggleMark('i'); return; }
      if (type === 'formatStrikeThrough') { e.preventDefault(); handle.current.toggleMark('s'); return; }
      if (type.startsWith('format')) { e.preventDefault(); return; }
      if (type === 'insertText' && e.data && stored.current && !composing.current) {
        const sel = getOffsets(el);
        const runs = domToRuns(el);
        const want = stored.current;
        if (!sel || sel.start !== sel.end || sel.start !== want.at) { stored.current = null; return; }
        if (sameMarks(marksAt(runs, sel.start), want.marks) && runs.length > 0) return;
        e.preventDefault();
        const at = sel.start + e.data.length;
        apply(replaceRange(runs, sel.start, sel.start, [{ ...want.marks, text: e.data }]), at, at, { inputType: type, data: e.data });
        stored.current = { marks: want.marks, at };
      }
    };
    el.addEventListener('beforeinput', before);
    return () => el.removeEventListener('beforeinput', before);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, blockId]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      spellCheck
      dir={dir}
      data-editable={blockId}
      data-placeholder={placeholder}
      className={className}
      style={style}
      onInput={e => {
        if (composing.current) return;
        const native = e.nativeEvent as InputEvent;
        sync({ inputType: native.inputType, data: native.data });
      }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={e => { composing.current = false; sync({ inputType: 'insertText', data: e.data }); }}
      onKeyDown={e => hub.onKeyDown(blockId, e, handle.current)}
      onFocus={() => hub.onFocus(blockId)}
      onBlur={() => { stored.current = null; hub.onBlur(blockId); }}
      onPaste={e => {
        e.preventDefault();
        hub.onPaste(blockId, e.clipboardData.getData('text/plain'), handle.current);
      }}
      onCopy={e => {
        const sel = getOffsets(ref.current!);
        if (!sel || sel.start === sel.end) return;
        e.preventDefault();
        e.clipboardData.setData('text/plain', runsToMd(sliceRuns(domToRuns(ref.current!), sel.start, sel.end)));
      }}
      onCut={e => {
        const sel = getOffsets(ref.current!);
        if (!sel || sel.start === sel.end) return;
        e.preventDefault();
        const runs = domToRuns(ref.current!);
        e.clipboardData.setData('text/plain', runsToMd(sliceRuns(runs, sel.start, sel.end)));
        apply(replaceRange(runs, sel.start, sel.end, []), sel.start, sel.start, { inputType: 'deleteByCut' });
      }}
      // Dropped text would bring its own markup; blocks are moved by their handle instead.
      onDrop={e => e.preventDefault()}
      onClick={e => {
        const link = (e.target as HTMLElement).closest<HTMLElement>('a[data-dest]');
        if (link && (e.ctrlKey || e.metaKey)) { e.preventDefault(); hub.onOpenLink(hrefOf(link.dataset.dest ?? '')); }
      }}
    />
  );
}, (a, b) =>
  a.blockId === b.blockId && a.text === b.text && a.dir === b.dir && a.className === b.className
  && a.placeholder === b.placeholder && a.hub === b.hub && sameStyle(a.style, b.style));
