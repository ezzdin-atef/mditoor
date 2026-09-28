import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface ActionItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
}

/**
 * "⋯" button that opens a small action menu. The menu is portalled to <body>
 * so cards with overflow:hidden can't clip it; clicks never reach the parent card.
 */
export function ActionMenu({ items, label, className, size = 16 }: {
  items: ActionItem[];
  label?: string;
  className?: string;
  size?: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuWidth = 200;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const height = items.length * 36 + 12;
    const up = window.innerHeight - r.bottom < height && r.top > height;
    const rtl = document.documentElement.dir === 'rtl';
    let left = rtl ? r.left : r.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left, up });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('button')?.focus());
    const close = (e: Event) => {
      if (e.type === 'scroll' && menuRef.current?.contains(e.target as Node)) return;
      if (e instanceof MouseEvent && (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const run = (item: ActionItem) => {
    setOpen(false);
    item.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); return; }
    const move = (n: number) => {
      e.preventDefault();
      const next = (active + n + items.length) % items.length;
      setActive(next);
      menuRef.current?.querySelectorAll<HTMLElement>('button')[next]?.focus();
    };
    if (e.key === 'ArrowDown') move(1);
    if (e.key === 'ArrowUp') move(-1);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`icon-btn ${className ?? ''}`}
        aria-label={label ?? t('common.actions')}
        title={label ?? t('common.actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        onKeyDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="action-menu"
          style={{ left: pos.left, width: menuWidth, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          onKeyDown={onKeyDown}
          onClick={e => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              className={`action-menu-item${item.danger ? ' danger' : ''}${item.separated ? ' separated' : ''}`}
              onClick={() => run(item)}
              onMouseEnter={() => setActive(i)}
            >
              {item.icon && <span className="action-menu-icon">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
