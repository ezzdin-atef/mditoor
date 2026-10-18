import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { toast } from '../../components/Toast';
import type { Workspace } from '../workspace/types';
import { StorageConfigTab } from '../workspace/components/StorageConfigTab';

export function DevSettings({ workspace }: { workspace: Workspace }) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const reconnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setSaving(true);
    try {
      await invoke('dev_connect', { workspaceId: workspace.id, apiKey: key.trim(), expectedUsername: workspace.devUsername });
      setKey('');
      toast.success(t('dev.keyUpdated'));
    } catch (error) {
      toast.error(t('dev.connectionFailed'), String(error));
    } finally {
      setSaving(false);
    }
  };

  return <div className="max-w-3xl space-y-5">
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('dev.account')}</h2>
          <p className="panel-subtitle">DEV.to / @{workspace.devUsername}</p>
        </div>
      </div>
      <div className="panel-body space-y-4">
        <form onSubmit={reconnect} className="space-y-3 max-w-xl">
          <label className="field-label" htmlFor="dev-reconnect-key">{t('dev.replaceKey')}</label>
          <input id="dev-reconnect-key" type="password" autoComplete="off" className="mac-input w-full dir-ltr" value={key} onChange={e => setKey(e.target.value)} placeholder={t('dev.apiKeyPlaceholder')} />
          <button className="mac-btn mac-btn-primary" disabled={!key.trim() || saving}>{saving ? t('dev.connecting') : t('dev.updateKey')}</button>
        </form>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('dev.localCopies')}</p>
      </div>
    </section>
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('dev.imageStorageTitle')}</h2>
          <p className="panel-subtitle">{t('dev.imageStorageHint')}</p>
        </div>
      </div>
      <div className="panel-body">
        <StorageConfigTab workspace={workspace} devOnly />
      </div>
    </section>
  </div>;
}
