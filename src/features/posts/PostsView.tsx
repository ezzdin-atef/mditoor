import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../router';
import type { Workspace } from '../workspace/types';
import { useViewPrefs, type PostSort } from '../settings/viewPrefs';
import { ViewToggle } from '../../components/ViewToggle';
import { CustomSelect } from '../../components/CustomSelect';
import { resolveImage } from '../assets/imageResolve';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { ActionMenu, type ActionItem } from '../../components/ActionMenu';
import { toast } from '../../components/Toast';
import { usePostDelete } from './usePostDelete';
import {
  IconCalendar, IconChevronRight, IconClock, IconFile, IconFolder, IconPlus, IconRefresh, IconSearch, IconSort, IconTrash, IconWords,
} from '../../components/Icons';
import { MOD, formatDate, colorFor, relativeTime, useInView } from '../../lib/ui';
import { toCardData, type PostCardData, type PostSummary } from './postMeta';
import { NewPostModal } from './NewPostModal';

/* ─── Cover image (lazy, cached) ─────────────────────────────────────── */

function PostImage({ workspace, post }: { workspace: Workspace; post: PostCardData }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cover = post.cover;

  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (!cover || !inView) return;
    if (/^(https?:|data:)/i.test(cover)) { setSrc(cover); return; }
    let alive = true;
    resolveImage(workspace, post.slug, cover)
      .then(r => { if (!alive) return; if (r.url) setSrc(r.url); else setFailed(true); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [cover, inView, post.slug, workspace]);

  const showImage = src && !failed;
  const letter = [...post.title.trim()][0]?.toUpperCase() ?? '?';

  return (
    <div ref={ref} className="w-full h-full">
      {showImage ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="post-cover-placeholder" style={{ background: colorFor(post.slug) }}>
          <span aria-hidden="true">{letter}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Gallery card ───────────────────────────────────────────────────── */

interface ItemProps { workspace: Workspace; post: PostCardData; onOpen: () => void; actions: ActionItem[] }

const openOnKey = (onOpen: () => void) => (e: React.KeyboardEvent) => {
  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); }
};

function PostCard({ workspace, post, onOpen, actions }: ItemProps) {
  const { t, i18n } = useTranslation();
  return (
    <div className="post-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={openOnKey(onOpen)} aria-label={post.title}>
      <div className="post-card-menu"><ActionMenu items={actions} className="icon-btn-sm" size={15} /></div>
      <div className="post-cover">
        <PostImage workspace={workspace} post={post} />
        <div className="post-cover-badges">
          {post.draft ? <span className="glass-badge draft">{t('posts.draft')}</span> : <span />}
          {post.words > 0 && (
            <span className="glass-badge">{t('posts.readMinutes', { n: Math.max(1, Math.round(post.words / 200)) })}</span>
          )}
        </div>
      </div>
      <div className="post-card-body">
        <h3 className="post-card-title" dir="auto">{post.title}</h3>
        {post.description && <p className="post-card-excerpt" dir="auto">{post.description}</p>}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {post.tags.slice(0, 3).map(tag => <span key={tag} className="chip">#{tag}</span>)}
            {post.tags.length > 3 && <span className="chip">+{post.tags.length - 3}</span>}
          </div>
        )}
        <div className="post-card-meta">
          {post.date ? (
            <span><IconCalendar size={12} />{formatDate(post.date, i18n.language)}</span>
          ) : (
            <span><IconClock size={12} />{relativeTime(post.modified, i18n.language)}</span>
          )}
          <span className="ui-mono truncate" style={{ marginInlineStart: 'auto' }}>{post.slug}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── List row ───────────────────────────────────────────────────────── */

function PostRow({ workspace, post, onOpen, actions }: ItemProps) {
  const { t, i18n } = useTranslation();
  return (
    <div className="post-row" role="listitem" tabIndex={0} onClick={onOpen} onKeyDown={openOnKey(onOpen)} aria-label={post.title}>
      <div className="post-thumb">
        <PostImage workspace={workspace} post={post} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }} dir="auto">
            {post.title}
          </span>
          {post.draft && <span className="badge badge-orange">{t('posts.draft')}</span>}
        </div>
        <div className="text-[12px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }} dir="auto">
          {post.description || <span className="ui-mono">{post.slug}</span>}
        </div>
      </div>
      <div className="hidden lg:flex items-center gap-1 flex-shrink-0 max-w-[220px] overflow-hidden">
        {post.tags.slice(0, 2).map(tag => <span key={tag} className="chip">#{tag}</span>)}
      </div>
      <div className="hidden sm:flex flex-col items-end flex-shrink-0 w-28 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
        <span>{post.date ? formatDate(post.date, i18n.language) : relativeTime(post.modified, i18n.language)}</span>
        <span className="inline-flex items-center gap-1"><IconWords size={11} />{t('posts.words', { n: post.words })}</span>
      </div>
      <ActionMenu items={actions} className="icon-btn-sm post-row-menu" size={15} />
      <IconChevronRight size={15} className="chevron flex-shrink-0" />
    </div>
  );
}

/* ─── Skeletons ──────────────────────────────────────────────────────── */

function Skeleton({ view }: { view: 'gallery' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="post-list" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="skeleton" style={{ width: 56, height: 40 }} />
            <div className="flex-1 space-y-2">
              <div className="skeleton" style={{ width: `${40 + (i * 13) % 35}%`, height: 12 }} />
              <div className="skeleton" style={{ width: `${55 + (i * 7) % 30}%`, height: 10 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="post-grid" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="post-card" style={{ cursor: 'default' }}>
          <div className="skeleton" style={{ aspectRatio: '16 / 9', borderRadius: 0 }} />
          <div className="post-card-body">
            <div className="skeleton" style={{ width: '70%', height: 14 }} />
            <div className="skeleton" style={{ width: '95%', height: 10 }} />
            <div className="skeleton" style={{ width: '60%', height: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main view ──────────────────────────────────────────────────────── */

export function PostsView({
  workspace,
  posts,
  loading,
  error,
  onRefresh,
  openNew = false,
  onNewOpened,
}: {
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
  const { postsView, postSort, set } = useViewPrefs();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (openNew) {
      setCreating(true);
      onNewOpened?.();
    }
  }, [openNew, onNewOpened]);

  const cards = useMemo(
    () => posts.map(p => toCardData(p, workspace.metadataFields)),
    [posts, workspace.metadataFields],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? cards.filter(c =>
          c.title.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some(tag => tag.toLowerCase().includes(q)))
      : cards;
    const sorted = [...filtered];
    if (postSort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (postSort === 'date') {
      const time = (c: PostCardData) => (c.date ? Date.parse(c.date) || 0 : 0);
      sorted.sort((a, b) => time(b) - time(a) || b.modified - a.modified);
    } else sorted.sort((a, b) => b.modified - a.modified);
    return sorted;
  }, [cards, postSort, query]);

  const existing = useMemo(() => new Set(posts.map(p => p.slug)), [posts]);
  const { deletePost, confirmationDialog } = usePostDelete();

  const actionsFor = (p: PostCardData): ActionItem[] => [
    { label: t('posts.actions.open'), icon: <IconFile size={14} />, onSelect: () => open(p.slug) },
    {
      label: t('posts.actions.reveal'),
      icon: <IconFolder size={14} />,
      onSelect: () => {
        invoke<string>('post_path', { mdxPath: workspace.mdxPath, slug: p.slug, profile: workspace.profile })
          .then(revealItemInDir)
          .catch(e => toast.error(t('posts.actions.revealFailed'), String(e)));
      },
    },
    {
      label: t('posts.actions.delete'),
      icon: <IconTrash size={14} />,
      danger: true,
      separated: true,
      onSelect: () => {
        void deletePost(workspace, p.slug, p.title).then(deleted => { if (deleted) onRefresh(); });
      },
    },
  ];
  const open = (slug: string, isNew = false) =>
    navigate({ page: 'editor', workspaceId: workspace.id, slug, isNew });

  if (error) {
    return (
      <div className="empty-state mac-fade-in">
        <div className="empty-illustration">🧭</div>
        <p className="empty-state-title">{t('posts.errorFolder')}</p>
        <p className="empty-state-hint ui-mono break-all">{error}</p>
        <button onClick={onRefresh} className="mac-btn">
          <IconRefresh size={14} />{t('posts.tryAgain')}
        </button>
      </div>
    );
  }

  const sortOptions: PostSort[] = ['updated', 'date', 'title'];

  return (
    <div className="space-y-5">
      <div className="toolbar-row">
        <div className="search-field">
          <IconSearch size={15} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('posts.search')}
            aria-label={t('posts.search')}
          />
        </div>

        <CustomSelect<PostSort>
          value={postSort}
          options={sortOptions.map(s => ({ value: s, label: t(`posts.sort.${s}`) }))}
          onChange={v => { if (v) set('postSort', v); }}
          icon={<IconSort size={14} />}
          ariaLabel={t('posts.sortBy')}
        />

        <ViewToggle value={postsView} onChange={v => set('postsView', v)} />

        <button onClick={onRefresh} className="icon-btn" title={t('posts.refresh')} aria-label={t('posts.refresh')}>
          <IconRefresh size={15} className={loading ? 'spin' : undefined} />
        </button>

        <div className="flex-1" />

        <button onClick={() => setCreating(true)} className="mac-btn mac-btn-fun">
          <IconPlus size={15} />{t('posts.new')}
          <kbd className="hidden md:inline-flex" style={{ background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>{MOD}N</kbd>
        </button>
      </div>

      {creating && (
        <NewPostModal
          profile={workspace.profile}
          existing={existing}
          onClose={() => setCreating(false)}
          onCreate={(slug, title) => {
            setCreating(false);
            navigate({ page: 'editor', workspaceId: workspace.id, slug, isNew: true, seed: { title } });
          }}
        />
      )}

      {loading && posts.length === 0 ? (
        <Skeleton view={postsView} />
      ) : posts.length === 0 ? (
        <div className="empty-state mac-fade-in">
          <div className="empty-illustration">✍️</div>
          <p className="empty-state-title">{t('posts.empty')}</p>
          <p className="empty-state-hint">{t('posts.emptyHint')}</p>
          <button onClick={() => setCreating(true)} className="mac-btn mac-btn-fun">
            <IconPlus size={15} />{t('posts.new')}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state mac-fade-in">
          <div className="empty-illustration">🔍</div>
          <p className="empty-state-title">{t('posts.noMatches', { query })}</p>
          <button onClick={() => setQuery('')} className="mac-btn">{t('posts.clearSearch')}</button>
        </div>
      ) : postsView === 'gallery' ? (
        <div className="post-grid stagger">
          {visible.map(p => (
            <PostCard key={p.slug} workspace={workspace} post={p} onOpen={() => open(p.slug)} actions={actionsFor(p)} />
          ))}
        </div>
      ) : (
        <div className="post-list stagger" role="list" aria-label={t('workspace.tabs.posts')}>
          {visible.map(p => (
            <PostRow key={p.slug} workspace={workspace} post={p} onOpen={() => open(p.slug)} actions={actionsFor(p)} />
          ))}
        </div>
      )}
      {confirmationDialog}
    </div>
  );
}
