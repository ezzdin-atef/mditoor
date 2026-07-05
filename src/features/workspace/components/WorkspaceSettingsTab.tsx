import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import type { Workspace } from '../types';
import { StorageConfigTab } from './StorageConfigTab';

const WORKSPACE_EMOJIS = ['📝', '✍️', '📚', '🗂️', '🚀', '💡', '🌍', '🧭', '📰', '📌', '⚙️', '✨'];

export function WorkspaceSettingsTab({ workspace }: { workspace: Workspace }) {
  const { updateWorkspace } = useStore();
  const { t } = useTranslation();
  const [name, setName] = useState(workspace.name);
  const [mdxPath, setMdxPath] = useState(workspace.mdxPath);
  const [icon, setIcon] = useState(workspace.icon);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(workspace.name);
    setMdxPath(workspace.mdxPath);
    setIcon(workspace.icon);
  }, [workspace.id, workspace.name, workspace.mdxPath, workspace.icon]);

  const dirty = name.trim() !== workspace.name ||
    mdxPath.trim() !== workspace.mdxPath ||
    icon !== workspace.icon;

  const browse = async () => {
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') setMdxPath(selected);
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    if (!dirty || !name.trim() || !mdxPath.trim()) return;
    setSaving(true);
    try {
      await updateWorkspace(workspace.id, {
        name: name.trim(),
        mdxPath: mdxPath.trim(),
        icon,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        <div className="px-4 py-3 flex items-start justify-between gap-4" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {t('workspace.settingsTitle')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.settingsHint')}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {saved && (
              <span className="text-xs mac-fade-slide" style={{ color: 'var(--green)' }}>
                {t('settings.saved')}
              </span>
            )}
            <button
              onClick={save}
              disabled={!dirty || saving || !name.trim() || !mdxPath.trim()}
              className="mac-btn mac-btn-primary disabled:opacity-40"
            >
              {saving ? '...' : t('common.save')}
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.icon')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WORKSPACE_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className="workspace-emoji-btn"
                  aria-pressed={icon === emoji}
                  style={{
                    background: icon === emoji ? 'var(--surface-2)' : 'transparent',
                    borderColor: icon === emoji ? 'var(--border-2)' : 'var(--border)',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.name')}
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="mac-input"
              placeholder={t('workspace.namePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.postsFolder')}
            </label>
            <div className="flex gap-2">
              <input
                value={mdxPath}
                onChange={e => setMdxPath(e.target.value)}
                className="mac-input mac-input-mono flex-1"
                placeholder={t('workspace.pathPlaceholder')}
              />
              <button
                type="button"
                onClick={browse}
                disabled={picking}
                className="mac-btn flex-shrink-0 disabled:opacity-50"
              >
                {picking ? '...' : t('workspace.browse')}
              </button>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
              {t('workspace.pathChangeHint')}
            </p>
          </div>
        </div>
      </section>

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        <div className="px-4 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {t('storage.s3ConfigTitle')}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t('storage.localConfigNote', { path: `${workspace.mdxPath}\\.mditoor.json` })}
          </p>
        </div>
        <div className="p-4">
          <StorageConfigTab workspaceId={workspace.id} storage={workspace.storage} mdxPath={workspace.mdxPath} />
        </div>
      </section>
    </div>
  );
}
