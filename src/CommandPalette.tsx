import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from './features/workspace/store';
import { useRouter } from './router';

/* ─── Types ──────────────────────────────────────────────────────────── */

type ItemType = 'nav' | 'workspace' | 'post';

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  type: ItemType;
  icon?: string;
  action: () => void;
}

/* ─── Icons ──────────────────────────────────────────────────────────── */

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconNav() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3.5 4.5h7M3.5 7h7M3.5 9.5h4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Row ────────────────────────────────────────────────────────────── */

function PaletteRow({
  item,
  selected,
  onMouseEnter,
}: {
  item: PaletteItem;
  selected: boolean;
  onMouseEnter: () => void;
}) {
  return (
    <button
      onClick={item.action}
      onMouseEnter={onMouseEnter}
      className="w-full flex items-center gap-3 px-4 py-2"
      style={{
        background: selected ? 'var(--text)' : 'transparent',
        color: selected ? 'var(--bg)' : 'var(--text)',
      }}
    >
      {/* Type icon */}
      <span
        className="flex-shrink-0"
        style={{ color: selected ? 'var(--surface-2)' : 'var(--text-faint)' }}
      >
        {item.type === 'workspace' && item.icon ? (
          <span className="block text-[14px]" aria-hidden="true">
            {item.icon}
          </span>
        ) : item.type === 'post' ? (
          <IconDoc />
        ) : (
          <IconNav />
        )}
      </span>

      {/* Label */}
      <span className="flex-1 text-[13px] truncate" style={{ fontWeight: selected ? 700 : 400 }}>{item.label}</span>

      {/* Hint */}
      {item.hint && (
        <span
          className="text-[11px] mac-input-mono flex-shrink-0 truncate max-w-[140px]"
          style={{ color: selected ? 'var(--surface-2)' : 'var(--text-faint)', opacity: 0.75 }}
        >
          {item.hint}
        </span>
      )}
    </button>
  );
}

/* ─── Command Palette ────────────────────────────────────────────────── */

export function CommandPalette() {
  const [open,      setOpen]      = useState(false);
  const [query,     setQuery]     = useState('');
  const [selected,  setSelected]  = useState(0);
  const [postSlugs, setPostSlugs] = useState<string[]>([]);

  const inputRef  = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { workspaces, activeId, setActive } = useStore();
  const { navigate } = useRouter();
  const active = workspaces.find(w => w.id === activeId) ?? null;

  /* Open/close on Cmd+K */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* Fetch posts when palette opens */
  useEffect(() => {
    if (!open || !active) { setPostSlugs([]); return; }
    invoke<string[]>('list_mdx_slugs', { path: active.mdxPath })
      .then(setPostSlugs)
      .catch(() => setPostSlugs([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active?.id]);

  /* Focus + reset on open */
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  /* Build item list */
  const navItems: PaletteItem[] = [
    {
      id: 'nav-home',
      group: 'Navigation',
      label: 'Go to Workspaces',
      hint: '',
      type: 'nav',
      action: () => { navigate({ page: 'workspace' }); close(); },
    },
    {
      id: 'nav-settings',
      group: 'Navigation',
      label: 'Open Settings',
      hint: '⌘,',
      type: 'nav',
      action: () => { navigate({ page: 'settings' }); close(); },
    },
  ];

  const workspaceItems: PaletteItem[] = workspaces.map(w => {
    return {
      id: `ws-${w.id}`,
      group: 'Workspaces',
      label: w.name,
      hint: w.mdxPath,
      type: 'workspace',
      icon: w.icon,
      action: () => {
        setActive(w.id);
        navigate({ page: 'workspace' });
        close();
      },
    };
  });

  const postItems: PaletteItem[] = active
    ? postSlugs.map(slug => ({
        id: `post-${slug}`,
        group: 'Posts',
        label: slug,
        hint: active.name,
        type: 'post',
        action: () => {
          navigate({ page: 'editor', workspaceId: active.id, slug, isNew: false });
          close();
        },
      }))
    : [];

  const allItems = [...navItems, ...workspaceItems, ...postItems];

  /* Filter */
  const q = query.trim().toLowerCase();
  const filtered = q
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.hint?.toLowerCase().includes(q) ?? false)
      )
    : allItems;

  /* Build groups */
  const groups: { name: string; items: (PaletteItem & { flatIdx: number })[] }[] = [];
  let counter = 0;
  for (const item of filtered) {
    let g = groups.find(g => g.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push({ ...item, flatIdx: counter++ });
  }
  const totalItems = counter;

  /* Keyboard navigation */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected(s => (s + 1) % Math.max(totalItems, 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(s => (s - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        filtered[selected]?.action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selected, totalItems, close]);

  /* Scroll selected item into view */
  useEffect(() => {
    if (!resultsRef.current) return;
    const el = resultsRef.current.querySelector(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  /* Reset selection when query changes */
  useEffect(() => { setSelected(0); }, [query]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ background: 'rgba(0,0,0,0.32)', zIndex: 100 }}
        onClick={close}
      />

      {/* Palette sheet */}
      <div
        className="fixed left-1/2 flex flex-col overflow-hidden"
        style={{
          top: '18%',
          transform: 'translateX(-50%)',
          width: 560,
          maxHeight: '62vh',
          zIndex: 101,
          background: 'var(--bg)',
          border: '1px solid var(--border-2)',
          borderRadius: 8,
          boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
          animation: 'palette-in 0.16s cubic-bezier(0.32,0.72,0,1) both',
        }}
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        <style>{`
          @keyframes palette-in {
            from { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.97); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1);    }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes palette-in {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          }
        `}</style>

        {/* Search row */}
        <div
          className="flex items-center gap-2.5 px-4 flex-shrink-0"
          style={{ height: 50, borderBottom: '1px solid var(--border)', color: 'var(--text-faint)' }}
        >
          <IconSearch />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands, workspaces, posts…"
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: '14px', color: 'var(--text)', caretColor: 'var(--accent)' }}
            aria-label="Search"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className="text-[10px] px-1.5 py-0.5"
            style={{
              fontFamily: "'Courier New', monospace",
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              color: 'var(--text-faint)',
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="overflow-y-auto flex-1 py-1">
          {groups.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                No results{query ? ` for "${query}"` : ''}
              </p>
            </div>
          )}

          {groups.map(group => (
            <div key={group.name}>
              <p
                className="px-4 pt-2.5 pb-1 text-[11px] font-medium"
                style={{ color: 'var(--text-muted)', marginBottom: '2px' }}
              >
                {group.name}
              </p>
              {group.items.map(item => (
                <div key={item.id} data-idx={item.flatIdx}>
                  <PaletteRow
                    item={item}
                    selected={item.flatIdx === selected}
                    onMouseEnter={() => setSelected(item.flatIdx)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div
          className="flex items-center gap-4 px-4 py-2 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {[
            { key: '↑↓', label: 'navigate' },
            { key: '↵',  label: 'open' },
            { key: '⌘K', label: 'toggle' },
          ].map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-faint)', fontFamily: "'Courier New', monospace" }}>
              <kbd>{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
