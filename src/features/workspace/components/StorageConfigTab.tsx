import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageConfig } from '../types';
import { DEFAULT_STORAGE } from '../types';
import { useStore } from '../store';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function StorageConfigTab({
  workspaceId,
  storage,
  mdxPath,
}: {
  workspaceId: string;
  storage: StorageConfig;
  mdxPath?: string;
}) {
  const { updateStorage } = useStore();
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<StorageConfig>(() => ({
    s3: { ...DEFAULT_STORAGE.s3, ...storage.s3 },
  }));
  const [secretDraft, setSecretDraft] = useState('');
  const [hasStoredSecret, setHasStoredSecret] = useState(Boolean(storage.s3.secretKey));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCfg({ s3: { ...DEFAULT_STORAGE.s3, ...storage.s3 } });
    setSecretDraft('');
    setHasStoredSecret(Boolean(storage.s3.secretKey));
  }, [storage]);

  const setS3 = <K extends keyof StorageConfig['s3']>(key: K, val: StorageConfig['s3'][K]) =>
    setCfg(prev => ({ ...prev, s3: { ...prev.s3, [key]: val } }));

  const handleSave = async () => {
    const nextCfg: StorageConfig = {
      ...cfg,
      s3: {
        ...cfg.s3,
        secretKey: secretDraft.trim() ? secretDraft : cfg.s3.secretKey,
      },
    };
    await updateStorage(workspaceId, nextCfg);
    setCfg(nextCfg);
    setSecretDraft('');
    setHasStoredSecret(Boolean(nextCfg.s3.secretKey));
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const inputCls = 'mac-input mac-input-mono w-full';

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div
          className="mb-5 px-3 py-3"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 6 }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text)' }}>
            {t('storage.whereStored')}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {t('storage.inS3')}. {t('storage.noThirdParty')}
          </p>
          {mdxPath && (
            <p className="text-[11px] mt-2 mac-input-mono break-all" style={{ color: 'var(--text-faint)' }}>
              {t('storage.configStoredAt', { path: `${mdxPath}\\.mditoor.json` })}
            </p>
          )}
          <p className="text-[11px] mt-2 mac-input-mono" style={{ color: 'var(--text-faint)' }}>
            {cfg.s3.bucket
              ? `${cfg.s3.bucket}/${cfg.s3.keyPrefix || ''}`
              : t('storage.notConfiguredHint')}
          </p>
        </div>

        <div className="space-y-4">
          <Field
            label={t('storage.endpoint')}
            hint={t('storage.endpointHint')}
          >
            <input
              type="text"
              value={cfg.s3.endpoint}
              onChange={e => setS3('endpoint', e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('storage.bucket')}>
              <input
                type="text"
                value={cfg.s3.bucket}
                onChange={e => setS3('bucket', e.target.value)}
                placeholder="my-bucket"
                className={inputCls}
              />
            </Field>
            <Field label={t('storage.region')}>
              <input
                type="text"
                value={cfg.s3.region}
                onChange={e => setS3('region', e.target.value)}
                placeholder="us-east-1"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label={t('storage.accessKey')}>
            <input
              type="text"
              value={cfg.s3.accessKey}
              onChange={e => setS3('accessKey', e.target.value)}
              placeholder="AKIA..."
              className={inputCls}
            />
          </Field>

          <Field label={t('storage.secretKey')}>
            <input
              type="password"
              value={secretDraft}
              onChange={e => setSecretDraft(e.target.value)}
              onContextMenu={e => e.preventDefault()}
              placeholder={hasStoredSecret ? t('storage.secretKeyStoredPlaceholder') : '••••••••'}
              className={inputCls}
              autoComplete="new-password"
            />
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
              {t('storage.secretKeyHiddenHint')}
            </p>
          </Field>

          <Field
            label={t('storage.keyPrefix')}
            hint={t('storage.keyPrefixHint')}
          >
            <input
              type="text"
              value={cfg.s3.keyPrefix}
              onChange={e => setS3('keyPrefix', e.target.value)}
              placeholder="images/"
              className={inputCls}
            />
          </Field>

          <Field
            label={t('storage.publicUrl')}
            hint={t('storage.publicUrlHint')}
          >
            <input
              type="text"
              value={cfg.s3.publicUrlPrefix}
              onChange={e => setS3('publicUrlPrefix', e.target.value)}
              placeholder="https://cdn.example.com"
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} className="mac-btn mac-btn-primary">
          {t('storage.save')}
        </button>
        {saved && (
          <span className="text-xs mac-fade-slide" style={{ color: 'var(--green)' }}>
            {t('storage.saved')}
          </span>
        )}
      </div>
    </div>
  );
}
