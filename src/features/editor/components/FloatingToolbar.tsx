import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  body: string;
  setBody: (v: string) => void;
  onInsertImage?: () => Promise<void>;
}

interface Pos { x: number; y: number; }

function inline(before: string, after = before, placeholder = 'text') {
  return (ta: HTMLTextAreaElement, body: string, setBody: (v: string) => void) => {
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

function linePrefix(prefix: string) {
  return (ta: HTMLTextAreaElement, body: string, setBody: (v: string) => void) => {
    const s  = ta.selectionStart;
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
      requestAnimationFrame(() => { ta.setSelectionRange(s + prefix.length, s + prefix.length); ta.focus(); });
    }
  };
}

type Action = (ta: HTMLTextAreaElement, body: string, setBody: (v: string) => void) => void;

function IconText({ children, size = 12, weight = 700, italic = false }: {
  children: string;
  size?: number;
  weight?: number;
  italic?: boolean;
}) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <text
        x="9"
        y="13"
        textAnchor="middle"
        fontSize={size}
        fontWeight={weight}
        fontStyle={italic ? 'italic' : 'normal'}
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {children}
      </text>
    </svg>
  );
}

function IconStrikethrough() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M6.2 5.3c.6-1 1.6-1.5 3-1.5 1.2 0 2.1.3 2.9.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 13.1c.8.6 1.9.9 3.3.9 1.8 0 3.1-.8 3.1-2.1 0-1.1-.8-1.7-2.5-2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3.2 9h11.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7 5.2 3.7 8.5 7 11.8M11 5.2l3.3 3.3-3.3 3.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M6.8 5.2H4.7c-.8 0-1.2.4-1.2 1.2v2.1c0 .8.4 1.2 1.2 1.2h1.1c0 1.2-.5 2.1-1.6 2.7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.1 5.2H12c-.8 0-1.2.4-1.2 1.2v2.1c0 .8.4 1.2 1.2 1.2h1.1c0 1.2-.5 2.1-1.6 2.7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="3" y="4" width="12" height="10" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.9" cy="7.1" r="1" fill="currentColor" />
      <path d="m4.2 12.8 3.3-3.2 2.2 2.1 1.2-1.2 2.9 2.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BUTTONS: { icon: ReactNode; title: string; action: Action }[] = [
  { icon: <IconText size={11}>H1</IconText>, title: 'Heading 1', action: linePrefix('# ') },
  { icon: <IconText size={10}>H2</IconText>, title: 'Heading 2', action: linePrefix('## ') },
  { icon: <IconText size={9}>H3</IconText>, title: 'Heading 3', action: linePrefix('### ') },
];

const INLINE_BUTTONS: { icon: ReactNode; title: string; action: Action }[] = [
  { icon: <IconText>B</IconText>, title: 'Bold', action: inline('**') },
  { icon: <IconText italic>I</IconText>, title: 'Italic', action: inline('*') },
  { icon: <IconStrikethrough />, title: 'Strikethrough', action: inline('~~') },
  { icon: <IconCode />, title: 'Inline code', action: inline('`') },
  { icon: <IconQuote />, title: 'Blockquote', action: linePrefix('> ') },
];

export function FloatingToolbar({ textareaRef, body, setBody, onInsertImage }: Props) {
  const [pos, setPos]           = useState<Pos | null>(null);
  const [hasSelection, setHas]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const toolbarRef              = useRef<HTMLDivElement>(null);
  const bodyRef                 = useRef(body);
  const setBodyRef              = useRef(setBody);
  bodyRef.current               = body;
  setBodyRef.current            = setBody;

  const checkSelection = (clientX?: number, clientY?: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const has = ta.selectionStart < ta.selectionEnd;
    setHas(has);
    if (has && clientX !== undefined && clientY !== undefined) {
      const toolbarW = toolbarRef.current?.offsetWidth ?? 354;
      const toolbarH = 38;
      const vw = window.innerWidth;
      const x = Math.min(Math.max(clientX - toolbarW / 2, 8), vw - toolbarW - 8);
      const y = Math.max(clientY - toolbarH - 12, 8);
      setPos({ x, y: y > 0 ? y : clientY + 24 });
    } else if (!has) {
      setPos(null);
    }
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const onMouseUp  = (e: MouseEvent)  => checkSelection(e.clientX, e.clientY);
    const onKeyUp    = (e: KeyboardEvent) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Shift'].includes(e.key)) {
        checkSelection();
      }
    };
    const onSelect   = () => { if (ta.selectionStart >= ta.selectionEnd) setPos(null); };
    const onBlur     = () => setTimeout(() => {
      if (!toolbarRef.current?.contains(document.activeElement)) {
        setPos(null); setHas(false);
      }
    }, 150);

    ta.addEventListener('mouseup',  onMouseUp);
    ta.addEventListener('keyup',    onKeyUp);
    ta.addEventListener('select',   onSelect);
    ta.addEventListener('blur',     onBlur);
    return () => {
      ta.removeEventListener('mouseup',  onMouseUp);
      ta.removeEventListener('keyup',    onKeyUp);
      ta.removeEventListener('select',   onSelect);
      ta.removeEventListener('blur',     onBlur);
    };
  }, [textareaRef]);

  const run = (action: Action) => {
    const ta = textareaRef.current;
    if (!ta) return;
    action(ta, bodyRef.current, setBodyRef.current);
    setPos(null); setHas(false);
  };

  const handleImage = async () => {
    if (!onInsertImage || uploading) return;
    setUploading(true);
    setPos(null); setHas(false);
    try { await onInsertImage(); } finally { setUploading(false); }
  };

  if (!pos || !hasSelection) return null;

  return (
    <div
      ref={toolbarRef}
      className="floating-toolbar mac-fade-slide"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={e => e.preventDefault()}
    >
      {BUTTONS.map(btn => (
        <button
          key={btn.title}
          onMouseDown={e => { e.preventDefault(); run(btn.action); }}
          title={btn.title}
          className="floating-toolbar-btn"
          aria-label={btn.title}
        >
          {btn.icon}
        </button>
      ))}

      <div className="floating-toolbar-divider" />

      {INLINE_BUTTONS.map(btn => (
        <button
          key={btn.title}
          onMouseDown={e => { e.preventDefault(); run(btn.action); }}
          title={btn.title}
          className="floating-toolbar-btn"
          aria-label={btn.title}
        >
          {btn.icon}
        </button>
      ))}

      {onInsertImage && (
        <>
          <div className="floating-toolbar-divider" />
          <button
            onMouseDown={e => { e.preventDefault(); void handleImage(); }}
            disabled={uploading}
            title="Upload image"
            className="floating-toolbar-btn"
            aria-label="Upload image"
          >
            {uploading ? <IconText size={14}>...</IconText> : <IconImage />}
          </button>
        </>
      )}
    </div>
  );
}
