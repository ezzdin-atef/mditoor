import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../router';
import type { Workspace } from '../workspace/types';
import { useViewPrefs, type PostSort } from '../settings/viewPrefs';
import { CustomSelect } from '../../components/CustomSelect';
import { ActionMenu, type ActionItem } from '../../components/ActionMenu';
import { toast } from '../../components/Toast';
import {
  IconChevronDown, IconChevronRight, IconFile, IconFolder, IconPen, IconPlus, IconRefresh, IconSearch, IconSort, IconTrash, IconX,
} from '../../components/Icons';
import { MOD, formatDate, relativeTime } from '../../lib/ui';
import { toCardData, type PostCardData, type PostSummary } from '../posts/postMeta';
import { NewPostModal } from '../posts/NewPostModal';
import { usePostDelete } from '../posts/usePostDelete';

/* ─── Paths ──────────────────────────────────────────────────────────── */

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Mirrors `check_note_path` in the backend: `/`-separated names, no `..`, `\` or `:`. */
export function validNotePath(path: string): boolean {
  return path !== '' && path.split('/').every(s => s.trim() === s && s !== '' && s !== '.' && s !== '..' && !/[\\:]/.test(s));
}

const cleanPath = (input: string) => input.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

// The open folder survives leaving for the editor and coming back.
const lastFolder = new Map<string, string>();

/* ─── Name prompt (new folder, rename / move) ────────────────────────── */

function PathPrompt({ title, label, initial, hint, submitLabel, onSubmit, onClose }: {
  title: string;
  label: string;
  initial: string;
  hint: string;
  submitLabel: string;
  onSubmit: (path: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const path = cleanPath(value);
  const valid = validNotePath(path);

  useEffect(() => {
    inputRef.current?.select();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try { await onSubmit(path); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal mac-sheet" role="dialog" aria-modal="true" aria-labelledby="path-prompt-title">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 id="path-prompt-title" className="flex-1 text-[18px] font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</h2>
          <button type="button" onClick={onClose} className="icon-btn" aria-label={t('common.close')}><IconX size={16} /></button>
        </div>
        <form onSubmit={submit} className="px-6 pt-5 pb-6 space-y-5">
          <div>
            <label className="field-label" htmlFor="path-prompt-input">{label}</label>
            <input
              id="path-prompt-input"
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              className="mac-input mac-input-mono dir-ltr"
              aria-invalid={value !== '' && !valid}
              style={{ borderColor: value !== '' && !valid ? 'var(--red)' : undefined }}
            />
            <p className="field-hint" style={{ color: value !== '' && !valid ? 'var(--red)' : undefined }}>
              {value !== '' && !valid ? t('notes.invalidPath') : hint}
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="mac-btn flex-1" style={{ height: 38 }}>{t('common.cancel')}</button>
            <button type="submit" disabled={!valid || busy} className="mac-btn mac-btn-fun flex-1" style={{ height: 38 }}>{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Folder tree ────────────────────────────────────────────────────── */

interface TreeProps {
  path: string;
  depth: number;
  childrenOf: (path: string) => string[];
  counts: Map<string, number>;
  current: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}

function TreeNode({ path, depth, childrenOf, counts, current, expanded, onToggle, onSelect }: TreeProps) {
  const kids = childrenOf(path);
  const open = expanded.has(path);
  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={current === path}>
      <div className={`notes-tree-item${current === path ? ' selected' : ''}`} style={{ paddingInlineStart: 6 + depth * 14 }}>
        {kids.length > 0 ? (
          <button type="button" className="notes-tree-twisty" onClick={() => onToggle(path)} aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} mirror />}
          </button>
        ) : <span className="notes-tree-twisty" aria-hidden="true" />}
        <button type="button" className="notes-tree-label" onClick={() => onSelect(path)} title={path}>
          <IconFolder size={14} />
          <span className="truncate flex-1">{baseName(path)}</span>
          {(counts.get(path) ?? 0) > 0 && <span className="notes-tree-count">{counts.get(path)}</span>}
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul role="group">
          {kids.map(k => <TreeNode key={k} {...{ path: k, depth: depth + 1, childrenOf, counts, current, expanded, onToggle, onSelect }} />)}
        </ul>
      )}
    </li>
  );
}

/* ─── Note row ───────────────────────────────────────────────────────── */

function NoteRow({ note, showPath, onOpen, actions }: { note: PostCardData; showPath: boolean; onOpen: () => void; actions: ActionItem[] }) {
  const { t, i18n } = useTranslation();
  const status = typeof note.meta.status === 'string' ? note.meta.status : '';
  return (
    <div
      className="post-row"
      role="listitem"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      aria-label={note.title}
    >
      <span className="notes-row-icon"><IconFile size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }} dir="auto">{note.title}</span>
          {status && <span className={`badge${status === 'done' ? ' badge-green' : status === 'learning' ? ' badge-accent' : ''}`}>{status}</span>}
        </div>
        <div className="text-[12px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }} dir="auto">
          {showPath ? <span className="ui-mono">{note.slug}</span> : note.description || <span className="ui-mono">{baseName(note.slug)}</span>}
        </div>
      </div>
      <div className="hidden lg:flex items-center gap-1 flex-shrink-0 max-w-[220px] overflow-hidden">
        {note.tags.slice(0, 3).map(tag => <span key={tag} className="chip">#{tag}</span>)}
      </div>
      <div className="hidden sm:flex flex-col items-end flex-shrink-0 w-28 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
        <span>{relativeTime(note.modified, i18n.language)}</span>
        {note.date && <span>{formatDate(note.date, i18n.language)}</span>}
        {!note.date && <span>{t('posts.words', { n: note.words })}</span>}
      </div>
      <ActionMenu items={actions} className="icon-btn-sm post-row-menu" size={15} />
    </div>
  );
}

/* ─── Main view ──────────────────────────────────────────────────────── */

type Prompt = { kind: 'folder'; parent: string } | { kind: 'move'; slug: string };

export function NotesView({ workspace, posts, loading, error, onRefresh, openNew = false, onNewOpened }: {
  workspace: Workspace;
  posts: PostSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  openNew?: boolean;
  onNewOpened?: () => void;
}) {
  const { navigate } = useRouter();
  const { t } = useTranslation();
  const { postSort, set } = useViewPrefs();
  const { mdxPath, profile } = workspace;
  const [folder, setFolderRaw] = useState(() => lastFolder.get(workspace.id) ?? '');
  const [folders, setFolders] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const { deletePost, confirmationDialog } = usePostDelete();

  const setFolder = useCallback((path: string) => {
    lastFolder.set(workspace.id, path);
    setFolderRaw(path);
    setQuery('');
    // Opening a folder reveals it in the tree.
    setExpanded(prev => {
      const next = new Set(prev);
      for (let p = parentOf(path); p; p = parentOf(p)) next.add(p);
      return next;
    });
  }, [workspace.id]);

  const loadFolders = useCallback(() => {
    invoke<string[]>('list_note_folders', { mdxPath }).then(setFolders).catch(() => setFolders([]));
  }, [mdxPath]);

  useEffect(() => { loadFolders(); }, [loadFolders, posts]);

  useEffect(() => {
    if (openNew) { setCreating(true); onNewOpened?.(); }
  }, [openNew, onNewOpened]);

  const notes = useMemo(() => posts.map(p => toCardData(p, workspace.metadataFields)), [posts, workspace.metadataFields]);

  // Notes per folder, counting everything below it.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      for (let p = parentOf(n.slug); p; p = parentOf(p)) map.set(p, (map.get(p) ?? 0) + 1);
    }
    return map;
  }, [notes]);

  // Image folders that hold no notes are storage, not part of the outline.
  const allFolders = useMemo(() => {
    const set = new Set(folders);
    for (const p of counts.keys()) set.add(p);
    return [...set].filter(f => !(baseName(f) === 'images' && !counts.get(f))).sort((a, b) => a.localeCompare(b));
  }, [folders, counts]);

  const childrenOf = useCallback((path: string) => allFolders.filter(f => parentOf(f) === path), [allFolders]);

  // The open folder may disappear (deleted outside the app); fall back to the root.
  useEffect(() => {
    if (folder && folders.length > 0 && !allFolders.includes(folder)) setFolder('');
  }, [allFolders, folder, folders.length, setFolder]);

  const sortNotes = useCallback((list: PostCardData[]) => {
    const sorted = [...list];
    if (postSort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (postSort === 'date') {
      const time = (c: PostCardData) => (c.date ? Date.parse(c.date) || 0 : 0);
      sorted.sort((a, b) => time(b) - time(a) || b.modified - a.modified);
    } else sorted.sort((a, b) => b.modified - a.modified);
    return sorted;
  }, [postSort]);

  const q = query.trim().toLowerCase();
  const visibleNotes = useMemo(() => {
    if (q) {
      return sortNotes(notes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.slug.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.tags.some(tag => tag.toLowerCase().includes(q))));
    }
    return sortNotes(notes.filter(n => parentOf(n.slug) === folder));
  }, [folder, notes, q, sortNotes]);

  const subfolders = q ? [] : childrenOf(folder);
  const existing = useMemo(() => new Set(posts.map(p => p.slug)), [posts]);

  const open = (slug: string) => navigate({ page: 'editor', workspaceId: workspace.id, slug, isNew: false });

  const reveal = (slug: string) => {
    invoke<string>('post_path', { mdxPath, slug, profile })
      .then(revealItemInDir)
      .catch(e => toast.error(t('posts.actions.revealFailed'), String(e)));
  };

  const deleteFolder = async (path: string) => {
    try {
      await invoke('delete_note_folder', { mdxPath, folder: path });
      if (folder === path || folder.startsWith(`${path}/`)) setFolder(parentOf(path));
      loadFolders();
    } catch {
      toast.error(t('notes.folderNotEmpty'), path);
    }
  };

  const noteActions = (n: PostCardData): ActionItem[] => [
    { label: t('posts.actions.open'), icon: <IconFile size={14} />, onSelect: () => open(n.slug) },
    { label: t('notes.move'), icon: <IconPen size={14} />, onSelect: () => setPrompt({ kind: 'move', slug: n.slug }) },
    { label: t('posts.actions.reveal'), icon: <IconFolder size={14} />, onSelect: () => reveal(n.slug) },
    {
      label: t('notes.deleteNote'), icon: <IconTrash size={14} />, danger: true, separated: true,
      onSelect: () => { void deletePost(workspace, n.slug, n.title).then(ok => { if (ok) onRefresh(); }); },
    },
  ];

  const folderActions = (path: string): ActionItem[] => [
    { label: t('notes.newFolder'), icon: <IconPlus size={14} />, onSelect: () => setPrompt({ kind: 'folder', parent: path }) },
    { label: t('notes.deleteFolder'), icon: <IconTrash size={14} />, danger: true, separated: true, onSelect: () => void deleteFolder(path) },
  ];

  const submitPrompt = async (path: string) => {
    if (!prompt) return;
    try {
      if (prompt.kind === 'folder') {
        const full = prompt.parent ? `${prompt.parent}/${path}` : path;
        await invoke('create_note_folder', { mdxPath, folder: full });
        loadFolders();
        setFolder(full);
      } else {
        if (path !== prompt.slug) {
          await invoke('move_note', { mdxPath, from: prompt.slug, to: path, profile });
          onRefresh();
        }
      }
      setPrompt(null);
    } catch (e) {
      toast.error(t(prompt.kind === 'folder' ? 'notes.folderFailed' : 'notes.moveFailed'), String(e));
    }
  };

  if (error) {
    return (
      <div className="empty-state mac-fade-in">
        <div className="empty-illustration">🧭</div>
        <p className="empty-state-title">{t('posts.errorFolder')}</p>
        <p className="empty-state-hint ui-mono break-all">{error}</p>
        <button onClick={onRefresh} className="mac-btn"><IconRefresh size={14} />{t('posts.tryAgain')}</button>
      </div>
    );
  }

  const crumbs = folder ? folder.split('/') : [];
  const sortOptions: PostSort[] = ['updated', 'date', 'title'];

  return (
    <div className="notes-layout">
      {/* ── Folder tree ── */}
      <nav className="notes-tree" aria-label={t('notes.folders')}>
        <div className="notes-tree-head">
          <span>{t('notes.folders')}</span>
          <button type="button" className="icon-btn icon-btn-sm" onClick={() => setPrompt({ kind: 'folder', parent: folder })} title={t('notes.newFolder')} aria-label={t('notes.newFolder')}>
            <IconPlus size={14} />
          </button>
        </div>
        <ul role="tree" aria-label={t('notes.folders')}>
          <li role="treeitem" aria-selected={folder === ''}>
            <div className={`notes-tree-item${folder === '' ? ' selected' : ''}`} style={{ paddingInlineStart: 6 }}>
              <span className="notes-tree-twisty" aria-hidden="true" />
              <button type="button" className="notes-tree-label" onClick={() => setFolder('')}>
                <span aria-hidden="true">{workspace.icon}</span>
                <span className="truncate flex-1">{t('notes.allNotes')}</span>
                <span className="notes-tree-count">{notes.length}</span>
              </button>
            </div>
          </li>
          {childrenOf('').map(f => (
            <TreeNode
              key={f}
              path={f}
              depth={0}
              childrenOf={childrenOf}
              counts={counts}
              current={folder}
              expanded={expanded}
              onToggle={p => setExpanded(prev => { const next = new Set(prev); if (next.has(p)) next.delete(p); else next.add(p); return next; })}
              onSelect={setFolder}
            />
          ))}
        </ul>
      </nav>

      {/* ── Folder contents ── */}
      <section className="flex-1 min-w-0 space-y-4">
        <div className="toolbar-row">
          <div className="search-field">
            <IconSearch size={15} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('notes.search')} aria-label={t('notes.search')} />
          </div>
          <CustomSelect<PostSort>
            value={postSort}
            options={sortOptions.map(s => ({ value: s, label: t(`notes.sort.${s}`) }))}
            onChange={v => { if (v) set('postSort', v); }}
            icon={<IconSort size={14} />}
            ariaLabel={t('posts.sortBy')}
          />
          <button onClick={() => { onRefresh(); loadFolders(); }} className="icon-btn" title={t('posts.refresh')} aria-label={t('posts.refresh')}>
            <IconRefresh size={15} className={loading ? 'spin' : undefined} />
          </button>
          <div className="flex-1" />
          <button onClick={() => setPrompt({ kind: 'folder', parent: folder })} className="mac-btn">
            <IconFolder size={14} />{t('notes.newFolder')}
          </button>
          <button onClick={() => setCreating(true)} className="mac-btn mac-btn-fun">
            <IconPlus size={15} />{t('notes.new')}
            <kbd className="hidden md:inline-flex" style={{ background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>{MOD}N</kbd>
          </button>
        </div>

        <nav className="notes-crumbs" aria-label={t('notes.location')}>
          {q ? (
            <span>{t('notes.searchResults', { count: visibleNotes.length })}</span>
          ) : <>
            <button type="button" onClick={() => setFolder('')} aria-current={folder === '' ? 'page' : undefined}>{workspace.name}</button>
            {crumbs.map((c, i) => {
              const path = crumbs.slice(0, i + 1).join('/');
              return (
                <span key={path} className="contents">
                  <IconChevronRight size={12} mirror />
                  <button type="button" onClick={() => setFolder(path)} aria-current={folder === path ? 'page' : undefined}>{c}</button>
                </span>
              );
            })}
          </>}
        </nav>

        {loading && posts.length === 0 ? (
          <div className="post-list" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ width: 20, height: 20 }} />
                <div className="skeleton" style={{ width: `${40 + (i * 13) % 35}%`, height: 12 }} />
              </div>
            ))}
          </div>
        ) : subfolders.length === 0 && visibleNotes.length === 0 ? (
          <div className="empty-state mac-fade-in">
            <div className="empty-illustration">{q ? '🔍' : '📓'}</div>
            <p className="empty-state-title">{q ? t('posts.noMatches', { query }) : t('notes.emptyFolder')}</p>
            {!q && <p className="empty-state-hint">{t('notes.emptyHint')}</p>}
            {q
              ? <button onClick={() => setQuery('')} className="mac-btn">{t('posts.clearSearch')}</button>
              : <button onClick={() => setCreating(true)} className="mac-btn mac-btn-fun"><IconPlus size={15} />{t('notes.new')}</button>}
          </div>
        ) : (
          <div className="post-list stagger" role="list" aria-label={t('notes.contents')}>
            {subfolders.map(f => (
              <div
                key={f}
                className="post-row"
                role="listitem"
                tabIndex={0}
                onClick={() => setFolder(f)}
                onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setFolder(f); } }}
              >
                <span className="notes-row-icon folder"><IconFolder size={16} /></span>
                <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{baseName(f)}</span>
                <span className="text-[11.5px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{t('notes.count', { count: counts.get(f) ?? 0 })}</span>
                <ActionMenu items={folderActions(f)} className="icon-btn-sm post-row-menu" size={15} />
                <IconChevronRight size={15} className="chevron flex-shrink-0" />
              </div>
            ))}
            {visibleNotes.map(n => (
              <NoteRow key={n.slug} note={n} showPath={Boolean(q)} onOpen={() => open(n.slug)} actions={noteActions(n)} />
            ))}
          </div>
        )}
      </section>

      {creating && (
        <NewPostModal
          profile={profile}
          existing={existing}
          folder={folder}
          heading={folder ? t('notes.newIn', { folder }) : t('notes.new')}
          onClose={() => setCreating(false)}
          onCreate={(slug, title) => {
            setCreating(false);
            navigate({ page: 'editor', workspaceId: workspace.id, slug, isNew: true, seed: { title } });
          }}
        />
      )}
      {prompt?.kind === 'folder' && (
        <PathPrompt
          title={prompt.parent ? t('notes.newFolderIn', { folder: prompt.parent }) : t('notes.newFolder')}
          label={t('notes.folderName')}
          initial=""
          hint={t('notes.folderHint')}
          submitLabel={t('posts.create')}
          onSubmit={submitPrompt}
          onClose={() => setPrompt(null)}
        />
      )}
      {prompt?.kind === 'move' && (
        <PathPrompt
          title={t('notes.move')}
          label={t('notes.notePath')}
          initial={prompt.slug}
          hint={t('notes.moveHint', { ext: profile.extension })}
          submitLabel={t('notes.moveButton')}
          onSubmit={submitPrompt}
          onClose={() => setPrompt(null)}
        />
      )}
      {confirmationDialog}
    </div>
  );
}
