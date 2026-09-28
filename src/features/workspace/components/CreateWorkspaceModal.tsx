import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { detectProject, useStore } from '../store';
import { FRAMEWORK_PRESETS } from '../types';
import type { ProjectInfo } from '../types';
import { joinPath } from '../../../lib/ui';
import { IconFolder, IconX } from '../../../components/Icons';
import { toast } from '../../../components/Toast';
import { WORKSPACE_EMOJIS } from './WorkspaceSettingsTab';

const folderName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  // The folder the user picked: either the project root or the posts folder itself.
  const [folder, setFolder] = useState('');
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [detecting, setDetecting] = useState(false);
  // Posts folder chosen inside the project when `folder` is the project root.
  const [contentDir, setContentDir] = useState('');
  const [icon, setIcon] = useState(WORKSPACE_EMOJIS[0]);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { addWorkspace } = useStore();
  const { t } = useTranslation();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // Re-detect whenever the folder changes; debounced so typing a path doesn't scan on every keystroke.
  useEffect(() => {
    const path = folder.trim();
    setInfo(null);
    setContentDir('');
    if (!path) { setDetecting(false); return; }
    let cancelled = false;
    setDetecting(true);
    const timer = window.setTimeout(() => {
      detectProject(path)
        .then(result => {
          if (cancelled) return;
          setInfo(result);
          if (result.isRoot && result.root && result.contentDirs[0]) {
            setContentDir(joinPath(result.root, result.contentDirs[0].path));
          }
        })
        .catch(() => { /* not a folder (yet): the path is used as-is */ })
        .finally(() => { if (!cancelled) setDetecting(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [folder]);

  const pickFolder = async (defaultPath?: string) => {
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false, defaultPath });
      return typeof selected === 'string' ? selected : null;
    } finally {
      setPicking(false);
    }
  };

  const handleBrowse = async () => {
    const selected = await pickFolder();
    if (!selected) return;
    setFolder(selected);
    // Suggest a name from the folder when the user hasn't typed one.
    if (!name.trim()) {
      const base = folderName(selected);
      if (base) setName(base.charAt(0).toUpperCase() + base.slice(1));
    }
  };

  const handleBrowseContent = async () => {
    const selected = await pickFolder(info?.root ?? undefined);
    if (selected) setContentDir(selected);
  };

  const isRoot = Boolean(info?.isRoot);
  const mdxPath = isRoot ? contentDir : folder.trim();
  const root = info?.root ?? null;
  const candidates = root ? info!.contentDirs.map(d => ({ ...d, abs: joinPath(root, d.path) })) : [];
  const customContent = isRoot && contentDir !== '' && !candidates.some(c => c.abs === contentDir);
  const canSubmit = Boolean(name.trim() && mdxPath && !detecting && !submitting);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await addWorkspace({
        name: name.trim(),
        mdxPath,
        rootPath: root ?? undefined,
        icon,
        framework: info?.framework,
      });
      toast.success(t('workspace.created', { name: name.trim() }));
      onClose();
    } catch (err) {
      toast.error(t('workspace.createFailed'), String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal mac-sheet" role="dialog" aria-modal="true" aria-labelledby="create-ws-title">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="ws-icon ws-icon-lg" style={{ background: 'var(--accent-faint)' }} aria-hidden="true">{icon}</span>
          <div className="flex-1 min-w-0">
            <h2 id="create-ws-title" className="text-[18px] font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {t('workspace.new')}
            </h2>
            <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('workspace.folderHint')}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label={t('common.close')}>
            <IconX size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-5">
          <div>
            <label className="field-label">{t('workspace.icon')}</label>
            <div className="flex flex-wrap gap-1.5">
              {WORKSPACE_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className="workspace-emoji-btn"
                  aria-pressed={icon === emoji}
                  style={{ width: 36, height: 36, fontSize: 17 }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="ws-path">{t('workspace.folder')}</label>
            <div className="flex gap-2">
              <input
                id="ws-path"
                type="text"
                value={folder}
                onChange={e => setFolder(e.target.value)}
                placeholder={t('workspace.pathPlaceholder')}
                className="mac-input mac-input-mono flex-1"
              />
              <button type="button" onClick={handleBrowse} disabled={picking} className="mac-btn flex-shrink-0" style={{ height: 36 }}>
                <IconFolder size={14} />{t('workspace.browse')}
              </button>
            </div>
            <p className="field-hint">
              {detecting
                ? t('workspace.detecting')
                : info?.root
                  ? isRoot
                    ? t('workspace.detectedRoot', { framework: FRAMEWORK_PRESETS[info.framework].label })
                    : t('workspace.detectedInside', { framework: FRAMEWORK_PRESETS[info.framework].label, root: info.root })
                  : t('workspace.folderHelp')}
            </p>
          </div>

          {isRoot && (
            <div>
              <label className="field-label">{t('workspace.contentFolder')}</label>
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t('workspace.contentFolder')}>
                {candidates.map(c => (
                  <label key={c.path} className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--text)' }}>
                    <input type="radio" name="content-dir" checked={contentDir === c.abs} onChange={() => setContentDir(c.abs)} />
                    <code className="ui-mono dir-ltr">{c.path}</code>
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      {t('posts.count', { count: c.posts })}
                    </span>
                  </label>
                ))}
                {customContent && (
                  <label className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text)' }}>
                    <input type="radio" name="content-dir" checked readOnly />
                    <code className="ui-mono dir-ltr truncate">{contentDir}</code>
                  </label>
                )}
              </div>
              <button type="button" onClick={handleBrowseContent} disabled={picking} className="mac-btn mac-btn-sm mt-2">
                <IconFolder size={13} />{t('workspace.chooseContentFolder')}
              </button>
              <p className="field-hint">
                {candidates.length === 0 && !contentDir ? t('workspace.noContentFolders') : t('workspace.contentFolderHint')}
              </p>
            </div>
          )}

          <div>
            <label className="field-label" htmlFor="ws-name">{t('workspace.name')}</label>
            <input
              id="ws-name"
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('workspace.namePlaceholder')}
              className="mac-input"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="mac-btn flex-1" style={{ height: 38 }}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="mac-btn mac-btn-fun flex-1"
              style={{ height: 38 }}
            >
              {t('workspace.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
