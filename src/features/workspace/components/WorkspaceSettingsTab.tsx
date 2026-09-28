import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { FRAMEWORK_PRESETS } from '../types';
import type { PostLayout, SiteProfile, Workspace } from '../types';
import { CustomSelect } from '../../../components/CustomSelect';
import { postFileName } from '../../posts/postMeta';
import { StorageConfigTab } from './StorageConfigTab';
import { IconCheck, IconFolder } from '../../../components/Icons';
import { toast } from '../../../components/Toast';
import { joinPath } from '../../../lib/ui';

export const WORKSPACE_EMOJIS = ['📝', '✍️', '📚', '🗂️', '🚀', '💡', '🌍', '🧭', '📰', '📌', '🎨', '✨', '🌱', '🍋', '🎧', '🧪'];

export function WorkspaceSettingsTab({ workspace }: { workspace: Workspace }) {
  const { updateWorkspace, updateProfile } = useStore();
  const { t } = useTranslation();
  const [name, setName] = useState(workspace.name);
  const [mdxPath, setMdxPath] = useState(workspace.mdxPath);
  const [rootPath, setRootPath] = useState(workspace.rootPath ?? '');
  const [icon, setIcon] = useState(workspace.icon);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(workspace.name);
    setMdxPath(workspace.mdxPath);
    setRootPath(workspace.rootPath ?? '');
    setIcon(workspace.icon);
  }, [workspace.id, workspace.name, workspace.mdxPath, workspace.rootPath, workspace.icon]);

  const dirty = name.trim() !== workspace.name ||
    mdxPath.trim() !== workspace.mdxPath ||
    rootPath.trim() !== (workspace.rootPath ?? '') ||
    icon !== workspace.icon;

  const browse = async (apply: (path: string) => void, defaultPath?: string) => {
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false, defaultPath: defaultPath || undefined });
      if (typeof selected === 'string') apply(selected);
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    if (!dirty || !name.trim() || !mdxPath.trim()) return;
    setSaving(true);
    try {
      await updateWorkspace(workspace.id, { name: name.trim(), mdxPath: mdxPath.trim(), rootPath: rootPath.trim() || undefined, icon });
      toast.success(t('settings.saved'));
    } catch (e) {
      toast.error(t('common.error'), String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('workspace.settingsTitle')}</h2>
            <p className="panel-subtitle">{t('workspace.settingsHint')}</p>
          </div>
          <button
            onClick={save}
            disabled={!dirty || saving || !name.trim() || !mdxPath.trim()}
            className="mac-btn mac-btn-primary"
          >
            <IconCheck size={14} />{t('common.save')}
          </button>
        </div>

        <div className="panel-body space-y-5">
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
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="ws-settings-name">{t('workspace.name')}</label>
            <input
              id="ws-settings-name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mac-input"
              placeholder={t('workspace.namePlaceholder')}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="ws-settings-path">{t('workspace.postsFolder')}</label>
            <div className="flex gap-2">
              <input
                id="ws-settings-path"
                value={mdxPath}
                onChange={e => setMdxPath(e.target.value)}
                className="mac-input mac-input-mono flex-1"
                placeholder={t('workspace.pathPlaceholder')}
              />
              <button type="button" onClick={() => void browse(setMdxPath, rootPath)} disabled={picking} className="mac-btn flex-shrink-0" style={{ height: 36 }}>
                <IconFolder size={14} />{t('workspace.browse')}
              </button>
            </div>
            <p className="field-hint">{t('workspace.pathChangeHint')}</p>
          </div>

          <div>
            <label className="field-label" htmlFor="ws-settings-root">
              {t('workspace.projectRoot')}
              <span className="badge" style={{ marginInlineStart: 8 }}>{FRAMEWORK_PRESETS[workspace.profile.framework].label}</span>
            </label>
            <div className="flex gap-2">
              <input
                id="ws-settings-root"
                value={rootPath}
                onChange={e => setRootPath(e.target.value)}
                className="mac-input mac-input-mono flex-1"
                placeholder={t('workspace.projectRootPlaceholder')}
              />
              <button type="button" onClick={() => void browse(setRootPath, rootPath)} disabled={picking} className="mac-btn flex-shrink-0" style={{ height: 36 }}>
                <IconFolder size={14} />{t('workspace.browse')}
              </button>
            </div>
            <p className="field-hint">{t('workspace.projectRootHint')}</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('workspace.layout.title')}</h2>
            <p className="panel-subtitle">{t('workspace.layout.hint')}</p>
          </div>
        </div>
        <div className="panel-body">
          <PostLayoutFields profile={workspace.profile} onChange={p => void updateProfile(workspace.id, p)} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('storage.title')}</h2>
            <p className="panel-subtitle">
              {t('storage.localConfigNote', { path: joinPath(workspace.mdxPath, '.mditoor.json') })}
            </p>
          </div>
        </div>
        <div className="panel-body">
          <StorageConfigTab workspace={workspace} />
        </div>
      </section>
    </div>
  );
}

function PostLayoutFields({ profile, onChange }: { profile: SiteProfile; onChange: (p: SiteProfile) => void }) {
  const { t } = useTranslation();
  const layouts: PostLayout[] = ['folder', 'flat', 'dated'];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="field-label">{t('workspace.layout.layout')}</label>
        <CustomSelect<PostLayout>
          value={profile.layout}
          options={layouts.map(l => ({ value: l, label: t(`workspace.layout.${l}`), hint: postFileName({ ...profile, layout: l }, 'my-post') }))}
          onChange={v => { if (v) onChange({ ...profile, layout: v }); }}
          ariaLabel={t('workspace.layout.layout')}
          width={240}
          menuMinWidth={300}
        />
      </div>
      <div>
        <label className="field-label">{t('workspace.layout.extension')}</label>
        <CustomSelect<SiteProfile['extension']>
          value={profile.extension}
          options={[{ value: '.mdx', label: '.mdx' }, { value: '.md', label: '.md' }]}
          onChange={v => { if (v) onChange({ ...profile, extension: v }); }}
          ariaLabel={t('workspace.layout.extension')}
          width={120}
        />
      </div>
      <code className="ui-mono text-[11.5px] dir-ltr pb-2" style={{ color: 'var(--text-faint)' }}>
        {postFileName(profile, profile.layout === 'dated' ? '2026-01-31-my-post' : 'my-post')}
      </code>
    </div>
  );
}
