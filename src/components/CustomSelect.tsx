import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export function CustomSelect({
  value,
  options = [],
  onChange,
  placeholder = '— choose —',
  showClear = true,
}: {
  value: string;
  options?: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  showClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? value;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="joy-btn w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 text-sm text-left transition-all duration-150"
        style={{
          background: 'var(--surface)',
          borderColor: open ? 'var(--accent)' : 'var(--border)',
          color: value ? 'var(--text)' : 'var(--text-faint)',
          boxShadow: open ? '0 0 0 4px var(--accent-faint)' : 'none',
        }}
      >
        <span className="truncate font-bold">{value ? selectedLabel : placeholder}</span>
        <span
          className="ml-2 text-[10px] flex-shrink-0 transition-transform duration-250"
          style={{
            color: 'var(--text-faint)',
            transform: open ? 'rotate(180deg)' : 'none',
            display: 'inline-block',
          }}
        >
          &#9660;
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1.5 rounded-2xl overflow-hidden dropdown-open"
          style={{
            top: '100%',
            background: 'var(--surface)',
            border: '2px solid var(--border)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.22), 0 0 0 1px var(--border)',
          }}
        >
          {showClear && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs border-b-2 font-bold transition-all duration-100"
              style={{
                color: 'var(--text-faint)',
                borderColor: 'var(--border)',
                background: 'transparent',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              &mdash; clear &mdash;
            </button>
          )}

          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm font-bold transition-all duration-100 flex items-center gap-2"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text)',
                  background: active ? 'var(--accent-faint)' : 'transparent',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = active ? 'var(--accent-faint)' : 'transparent';
                }}
              >
                <span
                  className="w-4 text-center text-xs font-black flex-shrink-0"
                  style={{ color: 'var(--accent)' }}
                >
                  {active ? '✓' : ''}
                </span>
                <span className="font-bold">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
