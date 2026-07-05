import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [mdxPath, setMdxPath] = useState('');
  const [picking, setPicking] = useState(false);
  const { addWorkspace } = useStore();
  const { t } = useTranslation();

  const handleBrowse = async () => {
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') setMdxPath(selected);
    } finally {
      setPicking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mdxPath.trim()) return;
    await addWorkspace(name.trim(), mdxPath.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm mac-sheet"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border-2)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text)' }}>
              {t('workspace.new')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.folderHint')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-base leading-none toolbar-btn"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('workspace.name')}
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('workspace.namePlaceholder')}
              className="mac-input"
            />
          </div>

          {/* Posts folder */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('workspace.postsFolder')}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-faint)' }}>
              {t('workspace.folderContains')}{' '}
              <code
                className="px-1 py-0.5 text-[11px] mac-input-mono"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-muted)' }}
              >
                [slug]/index.mdx
              </code>{' '}
              {t('workspace.filesSuffix')}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={mdxPath}
                onChange={e => setMdxPath(e.target.value)}
                placeholder={t('workspace.pathPlaceholder')}
                className="mac-input mac-input-mono flex-1"
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={picking}
                className="mac-btn flex-shrink-0 disabled:opacity-50"
              >
                {picking ? '...' : t('workspace.browse')}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1" style={{ borderTop: '1px solid var(--border-2)' }}>
            <button
              type="button"
              onClick={onClose}
              className="mac-btn flex-1 mt-3"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !mdxPath.trim()}
              className="mac-btn mac-btn-primary flex-1 mt-3 disabled:opacity-40"
            >
              {t('workspace.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
