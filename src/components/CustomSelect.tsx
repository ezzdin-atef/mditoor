import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconChevronDown, IconSearch } from './Icons';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

type Size = 'sm' | 'md';
type Variant = 'default' | 'ghost' | 'code';

interface Props<T extends string | number> {
  value: T | '';
  options?: SelectOption<T>[];
  onChange: (v: T | '') => void;
  placeholder?: string;
  /** Adds a "Clear" row that sets the value to ''. */
  showClear?: boolean;
  size?: Size;
  variant?: Variant;
  /** Icon shown before the label in the trigger. */
  icon?: ReactNode;
  ariaLabel?: string;
  /** Trigger width; the menu is at least as wide as the trigger. */
  width?: number | string;
  menuMinWidth?: number;
  className?: string;
}

const MENU_MAX_HEIGHT = 300;
const SEARCH_THRESHOLD = 9;

/**
 * Themed dropdown used everywhere instead of the native <select>.
 * The menu is portalled to <body> with fixed positioning so it is never clipped
 * by scrolling or overflow-hidden parents, and flips upward near the bottom edge.
 */
export function CustomSelect<T extends string | number = string>({
  value,
  options = [],
  onChange,
  placeholder,
  showClear = false,
  size = 'md',
  variant = 'default',
  icon,
  ariaLabel,
  width,
  menuMinWidth = 180,
  className,
}: Props<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => String(o.value) === String(value));
  const searchable = options.length >= SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < Math.min(MENU_MAX_HEIGHT, options.length * 34 + 60) && r.top > spaceBelow;
    const w = Math.max(r.width, menuMinWidth);
    const rtl = document.documentElement.dir === 'rtl';
    let left = rtl ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ left, top: up ? r.top - 4 : r.bottom + 4, width: w, up });
  }, [menuMinWidth, options.length]);

  const openMenu = () => {
    setQuery('');
    const idx = options.findIndex(o => String(o.value) === String(value));
    setActive(idx >= 0 ? idx : 0);
    place();
    setOpen(true);
  };

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const choose = (v: T | '') => {
    onChange(v);
    close();
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(visible.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = visible[active]; if (o) choose(o.value); }
    else if (e.key === 'Tab') { close(false); }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`cselect cselect-${size} cselect-${variant}${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        style={{ width }}
      >
        {(selected?.icon ?? icon) && <span className="cselect-icon">{selected?.icon ?? icon}</span>}
        <span className={`cselect-label${selected ? '' : ' placeholder'}`}>
          {selected ? selected.label : (placeholder ?? t('common.choose'))}
        </span>
        <IconChevronDown size={size === 'sm' ? 12 : 14} className="cselect-chevron" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="cselect-menu"
          role="listbox"
          onKeyDown={onKeyDown}
          style={{
            left: pos.left,
            width: pos.width,
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            transformOrigin: pos.up ? 'bottom center' : 'top center',
          }}
        >
          {searchable && (
            <div className="cselect-search">
              <IconSearch size={13} />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('common.filter')}
                aria-label={t('common.filter')}
              />
            </div>
          )}
          <div ref={listRef} className="cselect-list" style={{ maxHeight: MENU_MAX_HEIGHT }}>
            {showClear && value !== '' && (
              <button type="button" className="cselect-option muted" onMouseDown={e => e.preventDefault()} onClick={() => choose('')}>
                <span className="cselect-check" />
                {t('common.clear')}
              </button>
            )}
            {visible.length === 0 && <div className="cselect-empty">{t('common.noOptions')}</div>}
            {visible.map((o, i) => {
              const isSel = String(o.value) === String(value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  data-idx={i}
                  className={`cselect-option${isSel ? ' selected' : ''}${i === active ? ' active' : ''}`}
                  onMouseMove={() => { if (i !== active) setActive(i); }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(o.value)}
                >
                  <span className="cselect-check">{isSel && <IconCheck size={13} />}</span>
                  {o.icon && <span className="cselect-icon">{o.icon}</span>}
                  <span className="truncate flex-1">{o.label}</span>
                  {o.hint && <span className="cselect-hint">{o.hint}</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
