import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store';

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [mdxPath, setMdxPath] = useState('');
  const [picking, setPicking] = useState(false);
  const { addWorkspace } = useStore();

  const handleBrowse = async () => {
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') setMdxPath(selected);
    } finally {
      setPicking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mdxPath.trim()) return;
    addWorkspace(name.trim(), mdxPath.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(10,2,30,0.72)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-slide-up"
        style={{
          background: 'var(--surface)',
          border: '2px solid var(--border)',
          boxShadow: '0 32px 80px rgba(124,58,237,0.3)',
        }}
      >
        {/* Fun header */}
        <div
          className="relative px-7 py-6 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)' }}
        >
          {/* Decorative blobs */}
          <div
            className="absolute -right-6 -top-6 w-28 h-28 rounded-full"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          />
          <div
            className="absolute -right-2 bottom-0 w-20 h-20 rounded-full"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          />

          <div className="relative z-10">
            <div className="text-4xl mb-2 animate-float select-none">🚀</div>
            <h2 className="text-white font-black text-xl leading-tight">New Workspace</h2>
            <p className="text-white/65 text-xs mt-1 font-bold">
              Point to your MDX posts folder
            </p>
          </div>

          <button
            onClick={onClose}
            className="joy-btn absolute top-4 right-4 w-8 h-8 rounded-xl flex items-center justify-center font-black text-lg"
            style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)' }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          {/* Name */}
          <div>
            <label
              className="block text-[10px] font-black uppercase tracking-[0.18em] mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Workspace Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Blog, Portfolio, Docs..."
              className="w-full px-4 py-3 rounded-2xl border-2 text-sm font-bold transition-all duration-150"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
                outline: 'none',
              }}
              onFocus={e => {
                (e.target as HTMLInputElement).style.borderColor = 'var(--accent)';
                (e.target as HTMLInputElement).style.boxShadow = '0 0 0 4px var(--accent-faint)';
              }}
              onBlur={e => {
                (e.target as HTMLInputElement).style.borderColor = 'var(--border)';
                (e.target as HTMLInputElement).style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Posts folder */}
          <div>
            <label
              className="block text-[10px] font-black uppercase tracking-[0.18em] mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Posts Folder
            </label>
            <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--text-faint)' }}>
              The folder where your{' '}
              <code
                className="px-1.5 py-0.5 rounded-lg font-mono text-[11px]"
                style={{ background: 'var(--surface-3)', color: 'var(--accent)', border: '1px solid var(--border)' }}
              >
                [slug]/index.mdx
              </code>{' '}
              files live.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={mdxPath}
                onChange={e => setMdxPath(e.target.value)}
                placeholder="/path/to/posts"
                className="flex-1 px-4 py-3 rounded-2xl border-2 text-sm font-mono font-bold transition-all duration-150"
                style={{
                  background: 'var(--surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                  outline: 'none',
                }}
                onFocus={e => {
                  (e.target as HTMLInputElement).style.borderColor = 'var(--accent)';
                  (e.target as HTMLInputElement).style.boxShadow = '0 0 0 4px var(--accent-faint)';
                }}
                onBlur={e => {
                  (e.target as HTMLInputElement).style.borderColor = 'var(--border)';
                  (e.target as HTMLInputElement).style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={picking}
                className="joy-btn flex-shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-2xl text-sm font-black border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-muted)',
                }}
              >
                {picking ? (
                  <span className="animate-spin-joy inline-block">⭐</span>
                ) : (
                  <>📁 Browse</>
                )}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="joy-btn flex-1 px-4 py-3 rounded-2xl text-sm font-black border-2 transition-all"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !mdxPath.trim()}
              className="joy-btn flex-1 px-4 py-3 rounded-2xl text-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
                boxShadow: name.trim() && mdxPath.trim() ? '0 4px 18px rgba(167,139,250,0.42)' : 'none',
              }}
            >
              ✨ Create Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
