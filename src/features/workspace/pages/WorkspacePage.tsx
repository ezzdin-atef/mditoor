import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { COLORS, useStore } from '../store';
import { CreateWorkspaceModal } from '../components/CreateWorkspaceModal';
import { MetadataFieldEditor } from '../components/MetadataFieldEditor';
import { useRouter } from '../../../router';

const POST_EMOJIS = ['📝', '✍️', '💡', '🎯', '🔖', '📌', '🧩', '⚡', '🌟', '🎨'];

function slugEmoji(slug: string): string {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) h = ((h << 5) + h) ^ slug.charCodeAt(i);
  return POST_EMOJIS[Math.abs(h) % POST_EMOJIS.length];
}

export function WorkspacePage() {
  const { workspaces, activeId, setActive, deleteWorkspace } = useStore();
  const { navigate } = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'metadata'>('posts');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loadingSlugs, setLoadingSlugs] = useState(false);
  const [slugsError, setSlugsError] = useState<string | null>(null);

  const active = workspaces.find(w => w.id === activeId) ?? null;
  const color = active ? COLORS[active.colorIdx % COLORS.length] : COLORS[0];

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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ══ Sidebar ══ */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ background: 'var(--sb-bg)', borderRight: '1px solid var(--sb-border)' }}
      >
        {/* Logo area */}
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--sb-border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-base select-none flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
                boxShadow: '0 4px 16px rgba(167,139,250,0.5)',
              }}
            >
              ✨
            </div>
            <div>
              <p className="font-black text-sm leading-none" style={{ color: 'var(--sb-text)' }}>mditoor</p>
              <p className="text-[10px] mt-0.5 font-bold" style={{ color: 'var(--sb-muted)' }}>MDX editor</p>
            </div>
          </div>
        </div>

        {/* Workspace list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <p
            className="text-[9px] font-black uppercase tracking-[0.2em] px-2 mb-2.5"
            style={{ color: 'var(--sb-muted)' }}
          >
            Workspaces
          </p>

          {workspaces.length === 0 ? (
            <div className="text-center py-8 px-3">
              <div className="text-3xl mb-2 animate-float select-none">🌟</div>
              <p className="text-[11px] font-bold leading-relaxed" style={{ color: 'var(--sb-muted)' }}>
                No workspaces yet
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {workspaces.map(w => {
                const c = COLORS[w.colorIdx % COLORS.length];
                const isActive = w.id === activeId;
                return (
                  <button
                    key={w.id}
                    onClick={() => { setActive(w.id); setActiveTab('posts'); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all duration-200"
                    style={{
                      background: isActive ? 'var(--sb-active)' : 'transparent',
                      boxShadow: isActive ? `0 0 0 1.5px ${c.start}50` : 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sb-hover)';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-xs font-black"
                      style={{
                        background: `linear-gradient(135deg, ${c.start}, ${c.end})`,
                        boxShadow: `0 3px 10px ${c.start}55`,
                      }}
                    >
                      {w.name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <p
                      className="text-xs font-bold truncate flex-1"
                      style={{ color: isActive ? 'var(--sb-text)' : 'var(--sb-muted)' }}
                    >
                      {w.name}
                    </p>
                    {isActive && (
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: c.start }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div
          className="px-3 py-3 flex-shrink-0 space-y-2"
          style={{ borderTop: '1px solid var(--sb-border)' }}
        >
          <button
            onClick={() => setShowCreate(true)}
            className="joy-btn w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-white text-xs font-black"
            style={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
              boxShadow: '0 4px 18px rgba(167,139,250,0.42)',
            }}
          >
            <span>✨</span> New Workspace
          </button>
          <button
            onClick={() => navigate({ page: 'settings' })}
            className="joy-btn w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150"
            style={{ color: 'var(--sb-muted)', background: 'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sb-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            ⚙️ Settings
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
              className="px-8 pt-6 pb-0 flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${color.start}18 0%, ${color.end}0a 100%), var(--surface)`,
                borderBottom: '2px solid var(--border)',
              }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-4 animate-slide-left">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-black"
                    style={{
                      background: `linear-gradient(135deg, ${color.start}, ${color.end})`,
                      boxShadow: `0 6px 24px ${color.start}55`,
                    }}
                  >
                    {active.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <h1 className="text-xl font-black leading-tight" style={{ color: 'var(--text)' }}>
                      {active.name}
                    </h1>
                    <p
                      className="text-xs mt-0.5 font-mono font-semibold truncate max-w-sm"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      {active.mdxPath}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Delete workspace "${active.name}"? This won't delete any files.`)) {
                      deleteWorkspace(active.id);
                    }
                  }}
                  className="joy-btn text-xs font-bold px-3 py-1.5 rounded-xl border-2 transition-all"
                  style={{
                    color: 'var(--text-faint)',
                    borderColor: 'var(--border)',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = '#ef4444';
                    (e.currentTarget as HTMLElement).style.borderColor = '#fca5a5';
                    (e.currentTarget as HTMLElement).style.background = '#fef2f2';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  🗑 Delete
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-0.5">
                {(['posts', 'metadata'] as const).map(tab => {
                  const isTab = activeTab === tab;
                  const count =
                    tab === 'posts'
                      ? (slugs.length > 0 ? ` (${slugs.length})` : '')
                      : (active.metadataFields.length > 0 ? ` (${active.metadataFields.length})` : '');
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="px-5 py-2.5 text-sm font-black rounded-t-2xl capitalize transition-all duration-200"
                      style={
                        isTab
                          ? {
                              background: 'var(--surface)',
                              color: 'var(--accent)',
                              boxShadow: 'inset 0 -3px 0 var(--accent)',
                            }
                          : { color: 'var(--text-faint)', background: 'transparent' }
                      }
                    >
                      {tab === 'posts' ? '📝' : '🏷'} {tab}{count}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto" style={{ background: 'var(--surface)' }}>
              <div className="p-8">
                {activeTab === 'posts' ? (
                  <PostsView
                    slugs={slugs}
                    loading={loadingSlugs}
                    error={slugsError}
                    workspaceId={active.id}
                    onRefresh={() => fetchSlugs(active.mdxPath)}
                  />
                ) : (
                  <MetadataFieldEditor workspaceId={active.id} fields={active.metadataFields} />
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {showCreate && <CreateWorkspaceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function EmptyHome({ onNew }: { onNew: () => void }) {
  return (
    <div
      className="relative flex-1 flex flex-col items-center justify-center text-center px-8 overflow-hidden animate-slide-up"
    >
      {/* Decorative blobs */}
      <div
        className="absolute top-20 right-16 w-52 h-52 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--joy-blue), transparent 70%)',
          filter: 'blur(45px)',
          opacity: 0.28,
        }}
      />
      <div
        className="absolute bottom-24 left-16 w-60 h-60 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--joy-pink), transparent 70%)',
          filter: 'blur(55px)',
          opacity: 0.2,
        }}
      />
      <div
        className="absolute top-1/3 left-1/4 w-36 h-36 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--joy-yellow), transparent 70%)',
          filter: 'blur(32px)',
          opacity: 0.18,
        }}
      />

      <div className="relative z-10">
        <div className="text-8xl mb-6 animate-float select-none">🚀</div>
        <div
          className="inline-block px-4 py-1.5 rounded-full text-xs font-black mb-5"
          style={{ background: 'var(--accent-faint)', color: 'var(--accent)' }}
        >
          Welcome to mditoor!
        </div>
        <h2 className="text-3xl font-black mb-3 leading-tight" style={{ color: 'var(--text)' }}>
          Your MDX playground
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            is ready for you
          </span>{' '}
          ✨
        </h2>
        <p className="text-sm font-bold leading-relaxed mb-8 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
          Create a workspace to start managing your MDX content. Select a posts folder and define your frontmatter schema.
        </p>
        <button
          onClick={onNew}
          className="joy-btn px-8 py-4 rounded-2xl text-white font-black text-base"
          style={{
            background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
            boxShadow: '0 8px 30px rgba(167,139,250,0.48)',
          }}
        >
          ✨ Create my first Workspace
        </button>
      </div>
    </div>
  );
}

function PostsView({
  slugs,
  loading,
  error,
  workspaceId,
  onRefresh,
}: {
  slugs: string[];
  loading: boolean;
  error: string | null;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const { navigate } = useRouter();
  const [creatingSlug, setCreatingSlug] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  const handleCreate = () => {
    const slug = creatingSlug.trim().replace(/\s+/g, '-').toLowerCase();
    if (!slug) return;
    navigate({ page: 'editor', workspaceId, slug, isNew: true });
    setCreatingSlug('');
    setShowNewInput(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4 animate-spin-joy select-none">⭐</div>
        <p className="text-sm font-black" style={{ color: 'var(--text-muted)' }}>
          Scanning your posts...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-bounce-in">
        <div className="text-6xl mb-4 select-none">😬</div>
        <p className="text-base font-black mb-1" style={{ color: '#ef4444' }}>
          Could not read folder
        </p>
        <p className="text-xs font-mono mb-6 max-w-sm break-all" style={{ color: 'var(--text-faint)' }}>
          {error}
        </p>
        <button
          onClick={onRefresh}
          className="joy-btn px-5 py-2.5 rounded-2xl font-black text-sm border-2"
          style={{ borderColor: 'var(--border-2)', color: 'var(--text)', background: 'var(--surface-2)' }}
        >
          🔄 Try again
        </button>
      </div>
    );
  }

  if (slugs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-bounce-in">
        <div className="text-6xl mb-5 animate-float select-none">📄</div>
        <p className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>
          No posts yet!
        </p>
        <p className="text-sm font-bold mb-8 max-w-xs" style={{ color: 'var(--text-muted)' }}>
          Create your first post or add an existing{' '}
          <code
            className="px-1.5 py-0.5 rounded-lg text-xs font-mono"
            style={{
              background: 'var(--surface-3)',
              color: 'var(--accent)',
              border: '1px solid var(--border)',
            }}
          >
            [slug]/index.mdx
          </code>{' '}
          folder.
        </p>
        <div className="flex items-center gap-3">
          {showNewInput ? (
            <NewPostInput
              value={creatingSlug}
              onChange={setCreatingSlug}
              onCreate={handleCreate}
              onCancel={() => { setShowNewInput(false); setCreatingSlug(''); }}
            />
          ) : (
            <>
              <button
                onClick={() => setShowNewInput(true)}
                className="joy-btn px-6 py-3 rounded-2xl text-white font-black text-sm"
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
                  boxShadow: '0 6px 22px rgba(167,139,250,0.4)',
                }}
              >
                ✨ New Post
              </button>
              <button
                onClick={onRefresh}
                className="joy-btn text-sm font-bold px-4 py-2 rounded-xl border-2"
                style={{
                  color: 'var(--text-muted)',
                  borderColor: 'var(--border)',
                  background: 'var(--surface-2)',
                }}
              >
                🔄 Refresh
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: 'var(--joy-green)' }}
          />
          <span className="text-sm font-black" style={{ color: 'var(--text)' }}>
            {slugs.length} {slugs.length === 1 ? 'post' : 'posts'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="joy-btn text-xs font-bold px-3 py-1.5 rounded-xl border-2"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            🔄 Refresh
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
              className="joy-btn flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-black"
              style={{
                background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
                boxShadow: '0 4px 14px rgba(167,139,250,0.4)',
              }}
            >
              ✨ New Post
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 stagger">
        {slugs.map(slug => (
          <PostCard
            key={slug}
            slug={slug}
            onClick={() => navigate({ page: 'editor', workspaceId, slug, isNew: false })}
          />
        ))}
      </div>
    </div>
  );
}

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
  return (
    <div className="flex items-center gap-2 animate-bounce-in">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onCreate();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="my-awesome-post"
        className="px-3 py-2 rounded-xl font-mono text-xs font-bold w-44 border-2 transition-all duration-150"
        style={{
          background: 'var(--surface-2)',
          borderColor: 'var(--border-2)',
          color: 'var(--text)',
          outline: 'none',
        }}
        onFocus={e => {
          (e.target as HTMLInputElement).style.borderColor = 'var(--accent)';
          (e.target as HTMLInputElement).style.boxShadow = '0 0 0 4px var(--accent-faint)';
        }}
        onBlur={e => {
          (e.target as HTMLInputElement).style.borderColor = 'var(--border-2)';
          (e.target as HTMLInputElement).style.boxShadow = 'none';
        }}
      />
      <button
        onClick={onCreate}
        disabled={!value.trim()}
        className="joy-btn px-3 py-2 rounded-xl text-xs font-black text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}
      >
        Create
      </button>
      <button
        onClick={onCancel}
        className="joy-btn text-xs font-bold px-2 py-1.5 rounded-lg"
        style={{ color: 'var(--text-faint)' }}
      >
        Cancel
      </button>
    </div>
  );
}

function PostCard({ slug, onClick }: { slug: string; onClick: () => void }) {
  const emoji = slugEmoji(slug);
  return (
    <div
      onClick={onClick}
      className="joy-card group relative rounded-2xl p-4 select-none border-2"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="text-3xl mb-3 transition-all duration-300 group-hover:scale-125 group-hover:rotate-6 select-none">
        {emoji}
      </div>
      <p className="text-sm font-black truncate" style={{ color: 'var(--text)' }}>{slug}</p>
      <p className="text-[10px] font-mono mt-0.5 font-bold" style={{ color: 'var(--text-faint)' }}>
        index.mdx
      </p>
      <div
        className="absolute top-3 right-3 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: 'var(--joy-green)' }}
      />
    </div>
  );
}
