import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { CreateWorkspaceModal } from '../components/CreateWorkspaceModal';
import { MetadataFieldEditor } from '../components/MetadataFieldEditor';
import { WorkspaceSettingsTab } from '../components/WorkspaceSettingsTab';
import { GitPanel } from '../../git/components/GitPanel';
import { AssetGallery } from '../../assets/components/AssetGallery';
import { PostsView } from '../../posts/PostsView';
import { IdeasView } from '../../ideas/IdeasView';
import { useIdeas } from '../../ideas/store';
import type { PostSummary } from '../../posts/postMeta';
import type { SiteProfile } from '../types';
import { useRouter } from '../../../router';
import { useConfirmDialog } from '../../../components/ConfirmDialog';
import { openCommandPalette } from '../../../CommandPalette';
import { AppLogo } from '../../../components/AppLogo';
import {
  IconBranch, IconBulb, IconFile, IconFolder, IconImage, IconLayers, IconPlus, IconSearch, IconSettings, IconSliders, IconTrash,
} from '../../../components/Icons';
import { MOD } from '../../../lib/ui';

type Tab = 'posts' | 'ideas' | 'metadata' | 'git' | 'images' | 'settings';
const TABS: { id: Tab; icon: typeof IconFile }[] = [
  { id: 'posts',    icon: IconFile },
  { id: 'ideas',    icon: IconBulb },
  { id: 'images',   icon: IconImage },
  { id: 'git',      icon: IconBranch },
  { id: 'metadata', icon: IconLayers },
  { id: 'settings', icon: IconSliders },
];

interface GitStatusLite { is_repo: boolean; files: unknown[] }

export function WorkspacePage() {
  const { workspaces, activeId, setActive, deleteWorkspace } = useStore();
  const { navigate } = useRouter();
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [gitChanges, setGitChanges] = useState<number | null>(null);
  const { confirm, confirmationDialog } = useConfirmDialog();

  const active = workspaces.find(w => w.id === activeId) ?? null;
  const ideas = useIdeas(s => (active ? s.byPath[active.mdxPath] : undefined));
  const openIdeas = ideas?.filter(i => i.status !== 'drafted').length ?? 0;

  // Load ideas up front so the tab badge is right before the tab is opened.
  useEffect(() => {
    if (active) void useIdeas.getState().load(active.mdxPath);
  }, [active?.mdxPath]);

  const fetchPosts = useCallback((path: string, profile: SiteProfile) => {
    setLoadingPosts(true);
    setPostsError(null);
    invoke<PostSummary[]>('list_posts', { path, profile })
      .then(setPosts)
      .catch((e: unknown) => { setPostsError(String(e)); setPosts([]); })
      .finally(() => setLoadingPosts(false));
  }, []);

  const fetchGitCount = useCallback((path: string) => {
    invoke<GitStatusLite>('git_status', { mdxPath: path })
      .then(s => setGitChanges(s.is_repo ? s.files.length : null))
      .catch(() => setGitChanges(null));
  }, []);

  useEffect(() => {
    if (!active) { setPosts([]); setPostsError(null); setGitChanges(null); return; }
    setPosts([]);
    fetchPosts(active.mdxPath, active.profile);
    fetchGitCount(active.mdxPath);
  // The profile is read from .mditoor.json after activation, so re-list when its layout arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.mdxPath, active?.profile.layout, active?.profile.extension, fetchPosts, fetchGitCount]);

  // Pick up edits made outside the app when the window regains focus.
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const onFocus = () => {
      // Focus fires constantly while dragging/alt-tabbing; refresh at most every few seconds.
      if (Date.now() - last < 5000) return;
      last = Date.now();
      fetchPosts(active.mdxPath, active.profile);
      if (activeTab !== 'git') fetchGitCount(active.mdxPath);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.mdxPath, active?.profile, activeTab, fetchPosts, fetchGitCount]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() === 'n' && active) {
        e.preventDefault();
        setActiveTab('posts');
        setNewPostOpen(true);
      }
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setShowCreate(true);
      }
      if (/^[1-6]$/.test(e.key) && active) {
        e.preventDefault();
        setActiveTab(TABS[Number(e.key) - 1].id);
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

  const onNewOpened = useCallback(() => setNewPostOpen(false), []);

  const badgeFor = (tab: Tab): { value: number; attention?: boolean } | null => {
    if (!active) return null;
    if (tab === 'posts' && posts.length > 0) return { value: posts.length };
    if (tab === 'ideas' && openIdeas > 0) return { value: openIdeas };
    if (tab === 'metadata' && active.metadataFields.length > 0) return { value: active.metadataFields.length };
    if (tab === 'git' && gitChanges) return { value: gitChanges, attention: true };
    return null;
  };

  return (
    <div className="app-shell">
      {/* ══ Sidebar ══ */}
      <aside className="app-sidebar">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <AppLogo size={34} className="brand-mark" />
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight" style={{ color: 'var(--sb-text)', letterSpacing: '-0.01em' }}>
              {t('app.name')}
            </div>
            <div className="text-[11.5px]" style={{ color: 'var(--sb-muted)' }}>{t('app.tagline')}</div>
          </div>
        </div>

        <div className="px-3 pb-1">
          <button className="search-trigger" onClick={openCommandPalette}>
            <IconSearch size={14} />
            <span className="flex-1 text-start">{t('palette.trigger')}</span>
            <kbd>{MOD}K</kbd>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <div className="sidebar-label">{t('nav.workspaces')}</div>
          {workspaces.length === 0 ? (
            <p className="text-[12px] px-2.5 py-2" style={{ color: 'var(--sb-muted)' }}>{t('workspace.empty')}</p>
          ) : (
            <div className="space-y-1">
              {workspaces.map(w => {
                const isActive = w.id === activeId;
                return (
                  <button
                    key={w.id}
                    onClick={() => { void setActive(w.id); setActiveTab('posts'); }}
                    className={`mac-sidebar-item${isActive ? ' selected' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="ws-icon" style={{ background: isActive ? 'var(--accent-faint)' : 'var(--surface-2)' }} aria-hidden="true">
                      {w.icon}
                    </span>
                    <span className="truncate flex-1">{w.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="mac-sidebar-item mt-1"
            style={{ color: 'var(--accent)' }}
          >
            <span className="ws-icon" style={{ border: '1.5px dashed var(--accent-soft)' }}><IconPlus size={14} /></span>
            <span className="text-[13px] font-semibold">{t('workspace.new')}</span>
          </button>
        </div>

        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--sb-border)' }}>
          <button onClick={() => navigate({ page: 'settings' })} className="mac-sidebar-item">
            <span className="ws-icon" style={{ color: 'var(--sb-muted)' }}><IconSettings size={16} /></span>
            <span className="flex-1" style={{ color: 'var(--sb-text)' }}>{t('nav.settings')}</span>
            <kbd>{MOD},</kbd>
          </button>
        </div>
      </aside>

      {/* ══ Main content ══ */}
      <main className="app-main">
        {!active ? (
          <EmptyHome onNew={() => setShowCreate(true)} />
        ) : (
          <>
            <header className="page-header">
              <div className="flex items-center gap-4">
                <span className="ws-icon ws-icon-lg" style={{ background: 'var(--accent-faint)' }} aria-hidden="true">
                  {active.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="page-title truncate">{active.name}</h1>
                  <p className="text-[12px] mt-1 truncate mac-input-mono flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }} title={active.mdxPath}>
                    <IconFolder size={12} />{active.mdxPath}
                  </p>
                </div>
                <button
                  onClick={handleDelete}
                  className="icon-btn danger"
                  title={t('workspace.delete')}
                  aria-label={t('workspace.delete')}
                >
                  <IconTrash size={16} />
                </button>
              </div>

              <nav className="tab-strip" role="tablist">
                {TABS.map(({ id, icon: Icon }, i) => {
                  const isActiveTab = activeTab === id;
                  const badge = badgeFor(id);
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={isActiveTab}
                      onClick={() => setActiveTab(id)}
                      className={`notion-tab${isActiveTab ? ' active' : ''}`}
                      title={`${t(`workspace.tabs.${id}`)} (${MOD}${i + 1})`}
                    >
                      <Icon size={15} />
                      {t(`workspace.tabs.${id}`)}
                      {badge && <span className={`tab-count${badge.attention ? ' attention' : ''}`}>{badge.value}</span>}
                    </button>
                  );
                })}
              </nav>
            </header>

            <div className="flex-1 overflow-y-auto">
              <div className="page-body" key={`${active.id}:${activeTab}`}>
                {activeTab === 'posts' ? (
                  <PostsView
                    workspace={active}
                    posts={posts}
                    loading={loadingPosts}
                    error={postsError}
                    onRefresh={() => fetchPosts(active.mdxPath, active.profile)}
                    openNew={newPostOpen}
                    onNewOpened={onNewOpened}
                  />
                ) : activeTab === 'ideas' ? (
                  <IdeasView workspace={active} existingSlugs={posts.map(p => p.slug)} />
                ) : activeTab === 'metadata' ? (
                  <MetadataFieldEditor workspaceId={active.id} mdxPath={active.mdxPath} profile={active.profile} fields={active.metadataFields} />
                ) : activeTab === 'git' ? (
                  <GitPanel mdxPath={active.mdxPath} onChangeCount={setGitChanges} />
                ) : activeTab === 'images' ? (
                  <AssetGallery workspace={active} />
                ) : (
                  <WorkspaceSettingsTab workspace={active} />
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {showCreate && <CreateWorkspaceModal onClose={() => setShowCreate(false)} />}
      {confirmationDialog}
    </div>
  );
}

/* ─── Empty home ─────────────────────────────────────────────────────── */

function EmptyHome({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation();
  const steps = [
    { emoji: '📁', title: t('home.step1'), hint: t('home.step1Hint') },
    { emoji: '🧩', title: t('home.step2'), hint: t('home.step2Hint') },
    { emoji: '🚀', title: t('home.step3'), hint: t('home.step3Hint') },
  ];
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-16 text-center mac-fade-in">
        <div className="empty-illustration mx-auto" style={{ width: 104, height: 104, fontSize: 48, borderRadius: 32 }}>✍️</div>
        <h1 className="text-[28px] font-extrabold mt-2" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('home.title')}
        </h1>
        <p className="text-[14px] mt-2 mx-auto max-w-md leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {t('workspace.emptyHint')}
        </p>
        <button onClick={onNew} className="mac-btn mac-btn-fun mt-6" style={{ height: 40, padding: '0 18px', fontSize: 14 }}>
          <IconPlus size={16} />{t('workspace.create')}
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-12 text-start stagger">
          {steps.map((s, i) => (
            <div key={i} className="mac-card p-4">
              <div className="text-[22px]">{s.emoji}</div>
              <div className="text-[13px] font-bold mt-2" style={{ color: 'var(--text)' }}>{s.title}</div>
              <div className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
