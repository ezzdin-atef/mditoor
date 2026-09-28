import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from './Icons';

type Size = 'sm' | 'md';

interface Props {
  /** ISO date `YYYY-MM-DD`, optionally followed by a time part which is preserved on change. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Shows a clear button in the trigger and a "Clear" action in the popover. */
  showClear?: boolean;
  size?: Size;
  ariaLabel?: string;
  width?: number | string;
  className?: string;
}

interface Ymd { y: number; m: number; d: number } // m is 0-based

const POPOVER_WIDTH = 264;
const POPOVER_HEIGHT = 330;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');
const toIso = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const sameDay = (a: Ymd | null, b: Ymd | null) => !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;

function parse(value: string): Ymd | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  if (m < 0 || m > 11 || d < 1 || d > daysIn(y, m)) return null;
  return { y, m, d };
}

function todayYmd(): Ymd {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
}

/** Moves by days/months while clamping the day to the target month's length. */
function shift(base: Ymd, { days = 0, months = 0 }: { days?: number; months?: number }): Ymd {
  if (months) {
    const total = base.y * 12 + base.m + months;
    const y = Math.floor(total / 12);
    const m = total - y * 12;
    return { y, m, d: Math.min(base.d, daysIn(y, m)) };
  }
  const dt = new Date(Date.UTC(base.y, base.m, base.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

function firstDayOfWeek(lang: string): number {
  try {
    const loc = new Intl.Locale(lang) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay;
    if (first) return first % 7; // Intl uses 1=Mon..7=Sun
  } catch { /* fall through */ }
  if (lang.startsWith('en')) return 0;
  if (lang.startsWith('ar')) return 6;
  return 1;
}

/**
 * Themed date picker used instead of the native <input type="date">.
 * The calendar is portalled to <body> like CustomSelect so it is never clipped.
 * Keyboard: arrows move by day/week, PageUp/PageDown by month (+Shift by year),
 * Home/End to week edges, Enter selects, Escape closes.
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  showClear = false,
  size = 'md',
  ariaLabel,
  width,
  className,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const selected = parse(value);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [focus, setFocus] = useState<Ymd>(() => selected ?? todayYmd());
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const fmt = useMemo(() => ({
    display: new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    title: new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', timeZone: 'UTC' }),
    month: new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }),
    weekday: new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' }),
    weekdayLong: new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }),
    full: new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeZone: 'UTC' }),
    num: new Intl.NumberFormat(lang, { useGrouping: false }),
  }), [lang]);

  const asDate = (v: Ymd) => new Date(Date.UTC(v.y, v.m, v.d));
  const weekStart = useMemo(() => firstDayOfWeek(lang), [lang]);

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    // 2023-01-01 was a Sunday.
    const d = new Date(Date.UTC(2023, 0, 1 + ((weekStart + i) % 7)));
    return { short: fmt.weekday.format(d), long: fmt.weekdayLong.format(d) };
  }), [fmt, weekStart]);

  const cells = useMemo(() => {
    const lead = (new Date(Date.UTC(focus.y, focus.m, 1)).getUTCDay() - weekStart + 7) % 7;
    const start = shift({ y: focus.y, m: focus.m, d: 1 }, { days: -lead });
    return Array.from({ length: 42 }, (_, i) => shift(start, { days: i }));
  }, [focus.y, focus.m, weekStart]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < POPOVER_HEIGHT && r.top > spaceBelow;
    const rtl = document.documentElement.dir === 'rtl';
    let left = rtl ? r.right - POPOVER_WIDTH : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - POPOVER_WIDTH - 8));
    setPos({ left, top: up ? r.top - 4 : r.bottom + 4, up });
  }, []);

  const openPopover = () => {
    setFocus(parse(value) ?? todayYmd());
    setMode('days');
    place();
    setOpen(true);
  };

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const choose = (v: Ymd | null) => {
    if (!v) onChange('');
    else {
      // Keep any time/zone suffix (e.g. TOML datetimes) so only the date part changes.
      const suffix = ISO_DATE.test(value) ? value.slice(10) : '';
      onChange(toIso(v) + suffix);
    }
    close();
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
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

  // Keep DOM focus on the focused day so keyboard navigation and screen readers follow it.
  useEffect(() => {
    if (!open || mode !== 'days') return;
    gridRef.current?.querySelector<HTMLElement>(`[data-iso="${toIso(focus)}"]`)?.focus({ preventScroll: true });
  }, [open, mode, focus]);

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const rtl = document.documentElement.dir === 'rtl';
    const dayStep = rtl ? -1 : 1;
    const col = (asDate(focus).getUTCDay() - weekStart + 7) % 7;
    let next: Ymd | null = null;
    switch (e.key) {
      case 'ArrowRight': next = shift(focus, { days: dayStep }); break;
      case 'ArrowLeft': next = shift(focus, { days: -dayStep }); break;
      case 'ArrowDown': next = shift(focus, { days: 7 }); break;
      case 'ArrowUp': next = shift(focus, { days: -7 }); break;
      case 'PageDown': next = shift(focus, { months: e.shiftKey ? 12 : 1 }); break;
      case 'PageUp': next = shift(focus, { months: e.shiftKey ? -12 : -1 }); break;
      case 'Home': next = shift(focus, { days: -col }); break;
      case 'End': next = shift(focus, { days: 6 - col }); break;
      case 'Enter':
      case ' ': e.preventDefault(); choose(focus); return;
      default: return;
    }
    e.preventDefault();
    setFocus(next);
  };

  const onPopKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (mode !== 'days') setMode('days');
      else close();
    } else if (e.key === 'Tab') {
      // Keep Tab inside the popover.
      const items = Array.from(popRef.current?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])') ?? []);
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const nextIdx = e.shiftKey ? (idx <= 0 ? items.length - 1 : idx - 1) : (idx === items.length - 1 ? 0 : idx + 1);
      e.preventDefault();
      items[nextIdx].focus();
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openPopover();
    }
  };

  const today = todayYmd();
  const yearPageStart = focus.y - (focus.y % 12);
  const stepHeader = (dir: 1 | -1) => {
    if (mode === 'days') setFocus(f => shift(f, { months: dir }));
    else if (mode === 'months') setFocus(f => shift(f, { months: 12 * dir }));
    else setFocus(f => shift(f, { months: 144 * dir }));
  };
  const headerLabel = mode === 'days'
    ? fmt.title.format(asDate({ ...focus, d: 1 }))
    : mode === 'months'
      ? fmt.num.format(focus.y)
      : `${fmt.num.format(yearPageStart)} – ${fmt.num.format(yearPageStart + 11)}`;
  const prevLabel = mode === 'days' ? t('datePicker.prevMonth') : mode === 'months' ? t('datePicker.prevYear') : t('datePicker.prevYears');
  const nextLabel = mode === 'days' ? t('datePicker.nextMonth') : mode === 'months' ? t('datePicker.nextYear') : t('datePicker.nextYears');

  return (
    <>
      <div className={`dpicker-wrap${className ? ` ${className}` : ''}`} style={{ width }}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close() : openPopover())}
          onKeyDown={onTriggerKeyDown}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={`cselect cselect-${size} dpicker-trigger${open ? ' open' : ''}`}
          style={{ width: '100%' }}
          title={value && !selected ? value : undefined}
        >
          <span className="cselect-icon"><IconCalendar size={size === 'sm' ? 13 : 14} /></span>
          <span className={`cselect-label${value ? '' : ' placeholder'}`}>
            {selected ? fmt.display.format(asDate(selected)) : value || (placeholder ?? t('datePicker.placeholder'))}
          </span>
        </button>
        {showClear && value && (
          <button type="button" className="dpicker-clear" onClick={() => onChange('')} aria-label={t('common.clear')} title={t('common.clear')}>
            <IconX size={12} />
          </button>
        )}
      </div>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="dpicker-pop"
          role="dialog"
          aria-modal="false"
          aria-label={ariaLabel ?? t('datePicker.label')}
          onKeyDown={onPopKeyDown}
          style={{
            left: pos.left,
            width: POPOVER_WIDTH,
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            transformOrigin: pos.up ? 'bottom center' : 'top center',
          }}
        >
          <div className="dpicker-head">
            <button type="button" className="dpicker-nav" onClick={() => stepHeader(-1)} aria-label={prevLabel} title={prevLabel}>
              <IconChevronLeft size={15} mirror />
            </button>
            <button
              type="button"
              className="dpicker-title"
              onClick={() => setMode(m => (m === 'days' ? 'months' : m === 'months' ? 'years' : 'days'))}
              aria-live="polite"
            >
              {headerLabel}
            </button>
            <button type="button" className="dpicker-nav" onClick={() => stepHeader(1)} aria-label={nextLabel} title={nextLabel}>
              <IconChevronRight size={15} mirror />
            </button>
          </div>

          {mode === 'days' && (
            <div ref={gridRef} role="grid" className="dpicker-grid" onKeyDown={onGridKeyDown}>
              {weekdays.map((w, i) => (
                <span key={i} className="dpicker-wd" role="columnheader" aria-label={w.long}>{w.short}</span>
              ))}
              {cells.map(c => {
                const iso = toIso(c);
                const isFocus = sameDay(c, focus);
                const isSel = sameDay(c, selected);
                const outside = c.m !== focus.m;
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    data-iso={iso}
                    tabIndex={isFocus ? 0 : -1}
                    aria-selected={isSel}
                    aria-label={fmt.full.format(asDate(c))}
                    aria-current={sameDay(c, today) ? 'date' : undefined}
                    className={`dpicker-day${outside ? ' outside' : ''}${isSel ? ' selected' : ''}${sameDay(c, today) ? ' today' : ''}`}
                    onClick={() => choose(c)}
                  >
                    {fmt.num.format(c.d)}
                  </button>
                );
              })}
            </div>
          )}

          {mode === 'months' && (
            <div className="dpicker-cells">
              {Array.from({ length: 12 }, (_, m) => (
                <button
                  key={m}
                  type="button"
                  className={`dpicker-cell${selected && selected.y === focus.y && selected.m === m ? ' selected' : ''}${m === focus.m ? ' current' : ''}`}
                  onClick={() => { setFocus(f => ({ y: f.y, m, d: Math.min(f.d, daysIn(f.y, m)) })); setMode('days'); }}
                >
                  {fmt.month.format(new Date(Date.UTC(2023, m, 1)))}
                </button>
              ))}
            </div>
          )}

          {mode === 'years' && (
            <div className="dpicker-cells">
              {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map(y => (
                <button
                  key={y}
                  type="button"
                  className={`dpicker-cell${selected?.y === y ? ' selected' : ''}${y === focus.y ? ' current' : ''}`}
                  onClick={() => { setFocus(f => ({ y, m: f.m, d: Math.min(f.d, daysIn(y, f.m)) })); setMode('months'); }}
                >
                  {fmt.num.format(y)}
                </button>
              ))}
            </div>
          )}

          <div className="dpicker-foot">
            <button type="button" className="dpicker-link" onClick={() => choose(today)}>{t('datePicker.today')}</button>
            {showClear && value && (
              <button type="button" className="dpicker-link muted" onClick={() => choose(null)}>{t('common.clear')}</button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
