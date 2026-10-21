import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { detectProject, useStore } from '../store';
import { FRAMEWORK_PRESETS } from '../types';
import type { ProjectInfo } from '../types';
import { joinPath } from '../../../lib/ui';
import { IconCheck, IconFolder, IconX } from '../../../components/Icons';
import { toast } from '../../../components/Toast';
import { WORKSPACE_EMOJIS } from './WorkspaceSettingsTab';

const folderName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';

type Mode = 'local' | 'notes' | 'dev';
const MODES: Mode[] = ['local', 'notes', 'dev'];
const TYPE_ICON: Record<Mode, string> = { local: WORKSPACE_EMOJIS[0], notes: '📚', dev: '✍️' };

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('local');
  const [apiKey, setApiKey] = useState('');
  // Notes: version the folder with Git and optionally connect a remote to push to.
  const [useGit, setUseGit] = useState(true);
  const [remote, setRemote] = useState('');
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
  const { addWorkspace, addDevWorkspace, addNotesWorkspace } = useStore();
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
    // A notes folder is used as-is (and may not exist yet).
    if (!path || mode === 'notes') { setDetecting(false); return; }
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
  }, [folder, mode]);

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

  const isRoot = mode === 'local' && Boolean(info?.isRoot);
  const mdxPath = isRoot ? contentDir : folder.trim();
  const root = info?.root ?? null;
  const candidates = root ? info!.contentDirs.map(d => ({ ...d, abs: joinPath(root, d.path) })) : [];
  const customContent = isRoot && contentDir !== '' && !candidates.some(c => c.abs === contentDir);
  const canSubmit = mode === 'dev'
    ? Boolean(apiKey.trim() && !submitting)
    : Boolean(name.trim() && mdxPath && !detecting && !submitting);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (mode === 'dev') {
        const id = crypto.randomUUID();
        const user = await invoke<{ username: string }>('dev_connect', { workspaceId: id, apiKey: apiKey.trim() });
        if (!user.username) throw new Error(t('dev.invalidAccount'));
        await addDevWorkspace(id, user.username);
        toast.success(t('dev.connected', { username: user.username }));
        onClose();
        return;
      }
      if (mode === 'notes') {
        await addNotesWorkspace({ name: name.trim(), mdxPath, icon, git: useGit, remote: useGit ? remote : undefined });
        toast.success(t('workspace.created', { name: name.trim() }));
        onClose();
        return;
      }
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
      toast.error(t(mode === 'dev' ? 'dev.connectionFailed' : 'workspace.createFailed'), String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    // Swap the default icon to match the type, but keep one the user picked.
    if (TYPE_ICON[mode] === icon) setIcon(TYPE_ICON[next]);
  };

  // Roving focus between the type cards, like native radio buttons.
  const onTypeKey = (e: React.KeyboardEvent) => {
    const rtl = document.documentElement.dir === 'rtl';
    const step = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') ? 1
      : e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = MODES[(MODES.indexOf(mode) + step + MODES.length) % MODES.length];
    chooseMode(next);
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-ws-type="${next}"]`)?.focus(), 0);
  };

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide create-ws mac-sheet" role="dialog" aria-modal="true" aria-labelledby="create-ws-title">
        <div className="px-6 pt-5 pb-4 flex items-start gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="ws-icon ws-icon-lg" style={{ background: 'var(--accent-faint)' }} aria-hidden="true">{mode === 'dev' ? TYPE_ICON.dev : icon}</span>
          <div className="flex-1 min-w-0">
            <h2 id="create-ws-title" className="text-[18px] font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {t('workspace.new')}
            </h2>
            <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('workspace.types.question')}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label={t('common.close')}>
            <IconX size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="create-ws-form">
          <div className="create-ws-body space-y-5">
          <div>
            <div className="ws-type-grid" role="radiogroup" aria-label={t('dev.workspaceType')} onKeyDown={onTypeKey}>
              {MODES.map(m => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  data-ws-type={m}
                  aria-checked={mode === m}
                  tabIndex={mode === m ? 0 : -1}
                  className={`ws-type-card${mode === m ? ' active' : ''}`}
                  onClick={() => chooseMode(m)}
                >
                  <span className="ws-type-head">
                    <span className="ws-type-icon" aria-hidden="true">{TYPE_ICON[m]}</span>
                    <span className="ws-type-title">{t(`workspace.types.${m}.title`)}</span>
                    <span className="ws-type-radio" aria-hidden="true" />
                  </span>
                  <span className="ws-type-desc">{t(`workspace.types.${m}.desc`)}</span>
                  <span className="ws-type-best">{t(`workspace.types.${m}.best`)}</span>
                </button>
              ))}
            </div>
            {/* What this type sets up, so the choice is clear before filling anything in. */}
            <ul className="ws-type-points mac-fade-slide" key={mode} aria-live="polite">
              {[1, 2, 3].map(n => (
                <li key={n}><IconCheck size={13} />{t(`workspace.types.${mode}.point${n}`)}</li>
              ))}
            </ul>
          </div>

          {mode === 'dev' ? (
            <div>
              <label className="field-label" htmlFor="dev-key">{t('dev.apiKey')}</label>
              <input id="dev-key" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" className="mac-input w-full dir-ltr" placeholder={t('dev.apiKeyPlaceholder')} />
              <p className="field-hint">{t('dev.apiKeyHelp')}{' '}<button type="button" onClick={() => void openUrl('https://dev.to/settings/extensions')} style={{ color: 'var(--accent)' }}>{t('dev.getApiKey')}</button></p>
            </div>
          ) : <>
          <div>
            <label className="field-label" htmlFor="ws-path">{t(mode === 'notes' ? 'notes.folder' : 'workspace.folder')}</label>
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
              {mode === 'notes'
                ? t('notes.folderHelp')
                : detecting
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
              placeholder={t(mode === 'notes' ? 'notes.namePlaceholder' : 'workspace.namePlaceholder')}
              className="mac-input"
            />
          </div>

          <div>
            <label className="field-label">{t('workspace.icon')}</label>
            <div className="ws-emoji-row" role="radiogroup" aria-label={t('workspace.icon')}>
              {WORKSPACE_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={icon === emoji}
                  onClick={() => setIcon(emoji)}
                  className="workspace-emoji-btn"
                  aria-pressed={icon === emoji}
                  style={{ width: 32, height: 32, fontSize: 16 }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {mode === 'notes' && (
            <div className={`ws-git-card${useGit ? ' on' : ''}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={useGit} onChange={e => setUseGit(e.target.checked)} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{t('notes.useGit')}</span>
                  <span className="block text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('workspace.types.gitHint')}</span>
                </span>
              </label>
              {useGit && (
                <div className="mt-3 mac-fade-slide">
                  <label className="field-label" htmlFor="ws-remote">{t('notes.remote')}</label>
                  <input
                    id="ws-remote"
                    type="text"
                    value={remote}
                    onChange={e => setRemote(e.target.value)}
                    placeholder="https://github.com/you/notes.git"
                    className="mac-input mac-input-mono dir-ltr"
                  />
                  <p className="field-hint">{t('notes.remoteHint')}</p>
                </div>
              )}
            </div>
          )}

          </>}
          </div>

          <div className="create-ws-footer">
            <span className="text-[11.5px] min-w-0 truncate" style={{ color: 'var(--text-faint)' }}>{t(`workspace.types.${mode}.footer`)}</span>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="mac-btn" style={{ height: 36 }}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="mac-btn mac-btn-fun"
              style={{ height: 36, paddingInline: 18 }}
            >
              {submitting
                ? t(mode === 'dev' ? 'dev.connecting' : 'workspace.creating')
                : mode === 'dev' ? t('dev.connect') : t('workspace.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
