import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useStore } from './features/workspace/store';
import { useSettings } from './features/settings/store';
import { toCardData, type PostSummary } from './features/posts/postMeta';
import { useRouter } from './router';
import { IconArrowLeft, IconBulb, IconFile, IconSearch, IconSettings, IconSparkles } from './components/Icons';
import { useIdeas } from './features/ideas/store';
import { toast } from './components/Toast';
import { MOD } from './lib/ui';

/* ─── Open state (shared so buttons elsewhere can open the palette) ──── */

const usePaletteStore = create<{ open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }>(set => ({
  open: false,
  setOpen: v => set(s => ({ open: typeof v === 'function' ? v(s.open) : v })),
}));

export function openCommandPalette() {
  usePaletteStore.getState().setOpen(true);
}

/* ─── Types ──────────────────────────────────────────────────────────── */

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  action: () => void;
}

/* ─── Command Palette ────────────────────────────────────────────────── */

export function CommandPalette() {
  const { t } = useTranslation();
  const { open, setOpen } = usePaletteStore();
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState(0);
  const [posts,    setPosts]    = useState<PostSummary[]>([]);

  const inputRef   = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { workspaces, activeId, setActive } = useStore();
  const { theme, update } = useSettings();
  const { navigate } = useRouter();
  const active = workspaces.find(w => w.id === activeId) ?? null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  useEffect(() => {
    if (!open || !active) { setPosts([]); return; }
    invoke<PostSummary[]>('list_posts', { path: active.mdxPath, profile: active.profile })
      .then(setPosts)
      .catch(() => setPosts([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active?.id, active?.mdxPath, active?.profile]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = [
      {
        id: 'nav-home', group: t('palette.groups.navigation'), label: t('palette.goWorkspaces'),
        icon: <IconArrowLeft size={15} mirror />, action: () => navigate({ page: 'workspace' }),
      },
      {
        id: 'nav-settings', group: t('palette.groups.navigation'), label: t('palette.openSettings'), hint: `${MOD},`,
        icon: <IconSettings size={15} />, action: () => navigate({ page: 'settings' }),
      },
      {
        id: 'act-theme', group: t('palette.groups.actions'),
        label: theme === 'dark' ? t('palette.lightMode') : t('palette.darkMode'),
        icon: <IconSparkles size={15} />, action: () => update('theme', theme === 'dark' ? 'light' : 'dark'),
      },
    ];
    const ws: PaletteItem[] = workspaces.map(w => ({
      id: `ws-${w.id}`,
      group: t('palette.groups.workspaces'),
      label: w.name,
      hint: w.mdxPath,
      icon: <span className="text-[15px] leading-none">{w.icon}</span>,
      action: () => { void setActive(w.id); navigate({ page: 'workspace' }); },
    }));
    const postItems: PaletteItem[] = active
      ? posts.map(p => {
          const card = toCardData(p, active.metadataFields);
          return {
            id: `post-${p.slug}`,
            group: t('palette.groups.posts'),
            label: card.title,
            hint: p.slug,
            icon: <IconFile size={15} />,
            action: () => navigate({ page: 'editor', workspaceId: active.id, slug: p.slug, isNew: false }),
          };
        })
      : [];
    return [...nav, ...ws, ...postItems];
  }, [t, theme, update, navigate, workspaces, setActive, active, posts]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const matches = q
      ? allItems.filter(item =>
          item.label.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q) ||
          (item.hint?.toLowerCase().includes(q) ?? false))
      : allItems;
    const text = query.trim();
    if (!text || !active) return matches;
    // Anything typed can be captured as a post idea for the active workspace.
    const capture: PaletteItem = {
      id: 'idea-capture',
      group: t('palette.groups.ideas'),
      label: t('palette.saveIdea', { text }),
      hint: active.name,
      icon: <IconBulb size={15} />,
      action: () => {
        void useIdeas.getState().add(active.mdxPath, { title: text })
          .then(() => toast.success(t('ideas.added'), text));
      },
    };
    return [...matches, capture];
  }, [allItems, q, query, active, t]);

  const groups = useMemo(() => {
    const out: { name: string; items: (PaletteItem & { idx: number })[] }[] = [];
    filtered.forEach((item, idx) => {
      let g = out.find(g => g.name === item.group);
      if (!g) { g = { name: item.group, items: [] }; out.push(g); }
      g.items.push({ ...item, idx });
    });
    return out;
  }, [filtered]);

  const run = useCallback((item: PaletteItem | undefined) => {
    if (!item) return;
    item.action();
    close();
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const total = Math.max(filtered.length, 1);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => (s + 1) % total); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => (s - 1 + total) % total); }
      if (e.key === 'Enter')     { e.preventDefault(); run(filtered[selected]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selected, close, run]);

  useEffect(() => {
    resultsRef.current?.querySelector(`[data-idx="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => { setSelected(0); }, [query]);

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '14vh', zIndex: 100 }} onMouseDown={close}>
      <div
        className="modal mac-sheet flex flex-col"
        style={{ width: 'min(600px, 100%)', maxHeight: '64vh' }}
        role="dialog"
        aria-label={t('palette.label')}
        aria-modal="true"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ height: 56, borderBottom: '1px solid var(--border)', color: 'var(--accent)' }}>
          <IconSearch size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 15, color: 'var(--text)', caretColor: 'var(--accent)', outline: 'none' }}
            aria-label={t('palette.label')}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>

        <div ref={resultsRef} className="overflow-y-auto flex-1 p-2">
          {groups.length === 0 && (
            <div className="empty-state" style={{ padding: '36px 20px' }}>
              <div className="text-[28px]">🔍</div>
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{t('palette.noResults', { query })}</p>
            </div>
          )}

          {groups.map(group => (
            <div key={group.name} className="mb-1">
              <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase" style={{ color: 'var(--text-faint)', letterSpacing: '0.06em' }}>
                {group.name}
              </p>
              {group.items.map(item => {
                const isSel = item.idx === selected;
                return (
                  <button
                    key={item.id}
                    data-idx={item.idx}
                    onClick={() => run(item)}
                    onMouseMove={() => { if (!isSel) setSelected(item.idx); }}
                    className="w-full flex items-center gap-3 px-3 text-start"
                    style={{
                      height: 40,
                      borderRadius: 10,
                      border: 'none',
                      cursor: 'pointer',
                      background: isSel ? 'var(--accent-faint)' : 'transparent',
                      color: isSel ? 'var(--accent)' : 'var(--text)',
                    }}
                  >
                    <span className="w-6 flex items-center justify-center flex-shrink-0" style={{ color: isSel ? 'var(--accent)' : 'var(--text-faint)' }}>
                      {item.icon}
                    </span>
                    <span className="flex-1 text-[13.5px] truncate" style={{ fontWeight: isSel ? 650 : 500 }} dir="auto">{item.label}</span>
                    {item.hint && (
                      <span className="text-[11px] mac-input-mono flex-shrink-0 truncate max-w-[180px]" style={{ color: 'var(--text-faint)' }}>
                        {item.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 flex-shrink-0 text-[11px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-faint)', background: 'var(--surface)' }}>
          <span className="flex items-center gap-1.5"><kbd>↑</kbd><kbd>↓</kbd>{t('palette.navigate')}</span>
          <span className="flex items-center gap-1.5"><kbd>↵</kbd>{t('palette.open')}</span>
          <span className="flex items-center gap-1.5"><kbd>{MOD}K</kbd>{t('palette.toggle')}</span>
        </div>
      </div>
    </div>
  );
}
