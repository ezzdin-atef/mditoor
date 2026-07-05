import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export function CustomSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Choose...',
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
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-sm transition-all"
        style={{
          background: 'var(--surface)',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border-2)'}`,
          color: value ? 'var(--text)' : 'var(--text-faint)',
          boxShadow: open ? '2px 2px 0 var(--accent)' : 'none',
          outline: 'none',
        }}
      >
        <span className="truncate">{value ? selectedLabel : placeholder}</span>
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{
            marginInlineStart: 6,
            flexShrink: 0,
            color: 'var(--text-faint)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.12s ease',
          }}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-px mac-dropdown"
          style={{
            top: '100%',
            insetInlineStart: 0,
            insetInlineEnd: 0,
            background: 'var(--surface)',
            border: '1.5px solid var(--border-2)',
            boxShadow: '4px 4px 0 var(--border-2)',
          }}
        >
          {showClear && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full px-3 py-1.5 text-xs transition-colors duration-75"
              style={{
                color: 'var(--text-faint)',
                background: 'transparent',
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              Clear
            </button>
          )}

          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="w-full px-3 py-1.5 text-sm transition-colors duration-75 flex items-center gap-2"
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
                <span className="w-3 flex-shrink-0 text-center text-xs" style={{ color: 'var(--accent)' }}>
                  {active ? '✓' : ''}
                </span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
