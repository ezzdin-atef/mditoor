import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { CreateWorkspaceModal } from '../components/CreateWorkspaceModal';
import { MetadataFieldEditor } from '../components/MetadataFieldEditor';
import { WorkspaceSettingsTab } from '../components/WorkspaceSettingsTab';
import { GitPanel } from '../../git/components/GitPanel';
import { AssetGallery } from '../../assets/components/AssetGallery';
import { useRouter } from '../../../router';
import { useConfirmDialog } from '../../../components/ConfirmDialog';

type Tab = 'posts' | 'metadata' | 'git' | 'images' | 'settings';
const TABS: Tab[] = ['posts', 'metadata', 'git', 'images', 'settings'];

/* ─── Icons ──────────────────────────────────────────────────────────── */

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3.5 3.5l.5 7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg className="rtl-mirror" width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
      <path d="M3 2l2.5 2.5L3 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.5 1.5v1M6.5 10.5v1M1.5 6.5h1M10.5 6.5h1M3.05 3.05l.7.7M9.25 9.25l.7.7M9.95 3.05l-.7.7M3.75 9.25l-.7.7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M10.5 6A4.5 4.5 0 116 1.5a4.5 4.5 0 013.18 1.32L10.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.5 4h2V2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export function WorkspacePage() {
  const { workspaces, activeId, setActive, deleteWorkspace } = useStore();
  const { navigate } = useRouter();
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loadingSlugs, setLoadingSlugs] = useState(false);
  const [slugsError, setSlugsError] = useState<string | null>(null);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();

  const active = workspaces.find(w => w.id === activeId) ?? null;

  const fetchSlugs = (path: string) => {
    setLoadingSlugs(true);
    setSlugsError(null);
    invoke<string[]>('list_mdx_slugs', { path })
      .then(setSlugs)
      .catch((e: unknown) => { setSlugsError(String(e)); setSlugs([]); })
      .finally(() => setLoadingSlugs(false));
  };

  useEffect(() => {
    if (!active) { setSlugs([]); setSlugsError(null); return; }
    fetchSlugs(active.mdxPath);
  }, [active?.id, active?.mdxPath]);

  // Keyboard shortcuts: Cmd+N → new post, Cmd+, → new workspace
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'n' && active) {
        e.preventDefault();
        setActiveTab('posts');
        setNewPostOpen(true);
      }
      if (mod && e.key === ',' && !active) {
        e.preventDefault();
        setShowCreate(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);

  const handleDelete = async () => {
    if (!active) return;
    const confirmed = await confirm({
      title: t('workspace.delete'),
      message: t('workspace.deleteConfirm', { name: active.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (confirmed) deleteWorkspace(active.id);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ══ Sidebar ══ */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ background: 'var(--sb-bg)', borderInlineEnd: '1px solid var(--sb-border)' }}
      >
        {/* Masthead */}
        <div
          className="px-4 pt-4 pb-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--sb-border)' }}
        >
          <div
            className="text-[15px] font-semibold"
            style={{ color: 'var(--sb-text)' }}
          >
            {t('app.name')}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--sb-muted)' }}>
            {t('app.tagline')}
          </div>
        </div>

        {/* Workspace list — no eyebrow label */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
              {workspaces.length === 0 ? (
            <div className="px-2 py-3">
              <p className="text-xs" style={{ color: 'var(--sb-muted)' }}>{t('workspace.empty')}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {workspaces.map(w => {
                const isActive = w.id === activeId;
                return (
                  <button
                    key={w.id}
                    onClick={() => { setActive(w.id); setActiveTab('posts'); }}
                    className={`mac-sidebar-item${isActive ? ' selected' : ''}`}
                  >
                    <div
                      className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-[13px]"
                      aria-hidden="true"
                    >
                      {w.icon}
                    </div>
                    <span className="truncate flex-1 text-[13px]">{w.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div
          className="px-2 py-2 flex-shrink-0 space-y-0.5"
          style={{ borderTop: '1px solid var(--sb-border)' }}
        >
          <button
            onClick={() => setShowCreate(true)}
            className="mac-sidebar-item w-full"
            style={{ color: 'var(--accent)' }}
          >
            <IconPlus />
            <span className="text-[13px] font-medium">{t('workspace.new')}</span>
          </button>
          <button
            onClick={() => navigate({ page: 'settings' })}
            className="mac-sidebar-item w-full"
          >
            <IconSettings />
            <span className="text-[13px]" style={{ color: 'var(--sb-muted)' }}>{t('nav.settings')}</span>
          </button>
        </div>
      </aside>

      {/* ══ Main content ══ */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        {!active ? (
          <EmptyHome onNew={() => setShowCreate(true)} />
        ) : (
          <>
            {/* Workspace header */}
            <div
              className="px-6 pt-4 flex-shrink-0"
              style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
            >
              {/* Headline row */}
              <div className="flex items-start justify-between gap-4 pb-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-[20px] font-semibold truncate" style={{ color: 'var(--text)' }}>
                    <span className="me-2" aria-hidden="true">{active.icon}</span>
                    {active.name}
                  </h1>
                  <p className="text-xs mt-0.5 truncate mac-input-mono" style={{ color: 'var(--text-faint)' }}>
                    {active.mdxPath}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                  {/* Delete */}
                  <button
                    onClick={handleDelete}
                    className="toolbar-btn p-1.5 flex items-center justify-center"
                    title={t('workspace.delete')}
                    style={{ color: 'var(--text-faint)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>

              {/* Tab strip */}
              <div className="flex gap-0" role="tablist">
                {TABS.map(tab => {
                  const isActiveTab = activeTab === tab;
                  const badge =
                    tab === 'posts' && slugs.length > 0 ? slugs.length :
                    tab === 'metadata' && active.metadataFields.length > 0 ? active.metadataFields.length :
                    null;
                  return (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={isActiveTab}
                      onClick={() => setActiveTab(tab)}
                      className={`notion-tab${isActiveTab ? ' active' : ''} flex items-center gap-1.5`}
                    >
                      {t(`workspace.tabs.${tab}`)}
                      {badge !== null && (
                        <span
                          className="text-[10px] px-1.5 font-medium rounded-full"
                          style={{
                            background: 'var(--surface-2)',
                            color: 'var(--text-faint)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
              {activeTab === 'posts' ? (
                <PostsView
                  slugs={slugs}
                  loading={loadingSlugs}
                  error={slugsError}
                  workspaceId={active.id}
                  onRefresh={() => fetchSlugs(active.mdxPath)}
                  openNew={newPostOpen}
                  onNewOpened={() => setNewPostOpen(false)}
                />
              ) : activeTab === 'metadata' ? (
                <div className="p-6">
                  <MetadataFieldEditor workspaceId={active.id} mdxPath={active.mdxPath} fields={active.metadataFields} />
                </div>
              ) : activeTab === 'git' ? (
                <div className="p-6">
                  <GitPanel mdxPath={active.mdxPath} />
                </div>
              ) : activeTab === 'images' ? (
                <div className="p-6">
                  <AssetGallery mdxPath={active.mdxPath} storage={active.storage} />
                </div>
              ) : (
                <div className="p-6">
                  <WorkspaceSettingsTab workspace={active} />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showCreate && <CreateWorkspaceModal onClose={() => setShowCreate(false)} />}
      {confirmationDialog}
    </div>
  );
}

/* ─── Empty home (Feature 2 improves this) ───────────────────────────── */

function EmptyHome({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 mac-fade-in">
      <div className="w-64 mb-7">
        <div
          className="text-[28px] font-semibold py-2"
          style={{ color: 'var(--text)' }}
        >
          {t('app.name')}
        </div>
        <div className="text-[12px] mb-2" style={{ color: 'var(--text-muted)' }}>
          {t('app.tagline')}
        </div>
      </div>
      <p className="text-[13px] mb-6 max-w-[280px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {t('workspace.emptyHint')}
      </p>
      <button onClick={onNew} className="mac-btn mac-btn-primary">
        {t('workspace.create')}
      </button>
    </div>
  );
}

/* ─── Skeleton loading rows ──────────────────────────────────────────── */

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y" style={{ borderColor: 'var(--border)' }} aria-label="Loading posts" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-6 py-3">
          <div
            className="flex-shrink-0"
            style={{
              width: 13,
              height: 13,
              background: 'var(--surface-3)',
              animation: 'mac-fade-in 0.8s ease infinite alternate',
            }}
          />
          <div
            className=""
            style={{
              width: `${80 + (i * 37) % 120}px`,
              height: 12,
              background: 'var(--surface-3)',
              animation: 'mac-fade-in 0.8s ease infinite alternate',
              animationDelay: `${i * 0.05}s`,
            }}
          />
          <div
            className=""
            style={{
              width: 56,
              height: 10,
              background: 'var(--surface-2)',
              animation: 'mac-fade-in 0.8s ease infinite alternate',
              animationDelay: `${i * 0.05 + 0.04}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ─── Posts view ─────────────────────────────────────────────────────── */

function PostsView({
  slugs,
  loading,
  error,
  workspaceId,
  onRefresh,
  openNew = false,
  onNewOpened,
}: {
  slugs: string[];
  loading: boolean;
  error: string | null;
  workspaceId: string;
  onRefresh: () => void;
  openNew?: boolean;
  onNewOpened?: () => void;
}) {
  const { navigate } = useRouter();
  const { t } = useTranslation();
  const [creatingSlug, setCreatingSlug] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  useEffect(() => {
    if (openNew && !loading) {
      setShowNewInput(true);
      onNewOpened?.();
    }
  }, [openNew, loading]);

  const handleCreate = () => {
    const slug = creatingSlug.trim().replace(/\s+/g, '-').toLowerCase();
    if (!slug) return;
    navigate({ page: 'editor', workspaceId, slug, isNew: true });
    setCreatingSlug('');
    setShowNewInput(false);
  };

  /* Loading */
  if (loading) return <SkeletonRows />;

  /* Error */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center mac-fade-in px-6">
        <p className="text-[13px] font-medium mb-1.5" style={{ color: 'var(--red)' }}>
          {t('posts.errorFolder')}
        </p>
        <p className="text-xs mac-input-mono mb-5 max-w-sm break-all" style={{ color: 'var(--text-faint)' }}>
          {error}
        </p>
        <button onClick={onRefresh} className="mac-btn">
          {t('posts.tryAgain')}
        </button>
      </div>
    );
  }

  /* Empty */
  if (slugs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center mac-fade-in px-6">
        <p className="text-[13px] font-medium mb-1.5" style={{ color: 'var(--text)' }}>
          {t('posts.empty')}
        </p>
        <p className="text-[13px] mb-6" style={{ color: 'var(--text-muted)' }}>
          {t('posts.emptyHint')}
        </p>
        {showNewInput ? (
          <NewPostInput
            value={creatingSlug}
            onChange={setCreatingSlug}
            onCreate={handleCreate}
            onCancel={() => { setShowNewInput(false); setCreatingSlug(''); }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNewInput(true)} className="mac-btn mac-btn-primary">
              {t('posts.new')}
            </button>
            <button onClick={onRefresh} className="mac-btn">
              {t('posts.refresh')}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* Post list */
  return (
    <div>
      {/* List header */}
      <div
        className="flex items-center justify-between px-6 py-2.5 sticky top-0"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border-2)' }}
      >
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('posts.count', { count: slugs.length })}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="toolbar-btn p-1.5 flex items-center gap-1"
            title={t('posts.refresh')}
            aria-label={t('posts.refresh')}
          >
            <IconRefresh />
          </button>
          {showNewInput ? (
            <NewPostInput
              value={creatingSlug}
              onChange={setCreatingSlug}
              onCreate={handleCreate}
              onCancel={() => { setShowNewInput(false); setCreatingSlug(''); }}
            />
          ) : (
            <button
              onClick={() => setShowNewInput(true)}
              className="mac-btn mac-btn-primary flex items-center gap-1.5"
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              <IconPlus />
              {t('posts.new')}
            </button>
          )}
        </div>
      </div>

      {/* Rows */}
      <div
        className="divide-y"
        style={{ borderColor: 'var(--border)' }}
        role="list"
        aria-label="Posts"
      >
        {slugs.map(slug => (
          <PostRow
            key={slug}
            slug={slug}
            onClick={() => navigate({ page: 'editor', workspaceId, slug, isNew: false })}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Post row ───────────────────────────────────────────────────────── */

function PostRow({ slug, onClick }: { slug: string; onClick: () => void }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="listitem"
      className="w-full flex items-center gap-4 px-6 py-2.5 text-left transition-colors"
      style={{
        background: hovered ? 'var(--surface)' : 'transparent',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span className="text-[13px] font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>
        {slug}
      </span>
      <span
        className="text-[11px] mac-input-mono flex-shrink-0"
        style={{ color: 'var(--text-faint)' }}
      >
        {t('posts.indexFile')}
      </span>
      <span
        className="flex-shrink-0 transition-opacity"
        style={{ color: 'var(--text-faint)', opacity: hovered ? 1 : 0 }}
      >
        <IconChevronRight />
      </span>
    </button>
  );
}

/* ─── New post input ─────────────────────────────────────────────────── */

function NewPostInput({
  value,
  onChange,
  onCreate,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex items-center gap-2 mac-fade-slide">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onCreate();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={t('posts.slugPlaceholder')}
        className="mac-input mac-input-mono"
        style={{ width: '150px', fontSize: '12px', padding: '3px 8px' }}
        aria-label={t('posts.new')}
      />
      <button
        onClick={onCreate}
        disabled={!value.trim()}
        className="mac-btn mac-btn-primary disabled:opacity-40"
        style={{ fontSize: '12px', padding: '3px 10px' }}
      >
        {t('posts.create')}
      </button>
      <button
        onClick={onCancel}
        className="mac-btn"
        style={{ fontSize: '12px', padding: '3px 10px' }}
      >
        {t('posts.cancel')}
      </button>
    </div>
  );
}
