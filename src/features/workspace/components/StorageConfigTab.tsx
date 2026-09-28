import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageOptimizeConfig, LocalStorageConfig, StorageConfig, StorageProvider, Workspace } from '../types';
import { normalizeStorage } from '../types';
import { useStore } from '../store';
import { publicAssetDir } from '../../assets/imageUpload';

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

export function StorageConfigTab({ workspace }: { workspace: Workspace }) {
  const { id: workspaceId, storage } = workspace;
  const { updateStorage } = useStore();
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<StorageConfig>(() => normalizeStorage(storage));
  const [secretDraft, setSecretDraft] = useState('');
  const [hasStoredSecret, setHasStoredSecret] = useState(Boolean(storage.s3.secretKey));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCfg(normalizeStorage(storage));
    setSecretDraft('');
    setHasStoredSecret(Boolean(storage.s3.secretKey));
  }, [storage]);

  const setS3 = <K extends keyof StorageConfig['s3']>(key: K, val: StorageConfig['s3'][K]) =>
    setCfg(prev => ({ ...prev, s3: { ...prev.s3, [key]: val } }));
  const setLocal = <K extends keyof LocalStorageConfig>(key: K, val: LocalStorageConfig[K]) =>
    setCfg(prev => ({ ...prev, local: { ...prev.local, [key]: val } }));
  const setOptimize = <K extends keyof ImageOptimizeConfig>(key: K, val: ImageOptimizeConfig[K]) =>
    setCfg(prev => ({ ...prev, optimize: { ...prev.optimize, [key]: val } }));
  const setProvider = (provider: StorageProvider) => setCfg(prev => ({ ...prev, provider }));

  const isLocal = cfg.provider === 'local';
  const resolvedPublicDir = publicAssetDir({ rootPath: workspace.rootPath, storage: cfg });
  const status = isLocal
    ? cfg.local.mode === 'colocated'
      ? t('storage.local.colocatedStatus')
      : resolvedPublicDir ?? t('storage.local.noRoot')
    : cfg.s3.bucket
      ? `${cfg.s3.bucket}/${cfg.s3.keyPrefix || ''}`
      : t('storage.notConfigured');
  const statusOk = isLocal ? cfg.local.mode === 'colocated' || Boolean(resolvedPublicDir) : Boolean(cfg.s3.bucket);

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
    <div className="space-y-5">

      {/* Status line */}
      <div className="flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: statusOk ? 'var(--green)' : 'var(--surface-3)' }}
        />
        <span className="text-[11px] mac-input-mono truncate" style={{ color: 'var(--text-faint)' }}>
          {status}
        </span>
        <span
          className="text-[10px] mac-input-mono truncate"
          style={{ color: 'var(--text-faint)', marginInlineStart: 'auto', flexShrink: 0 }}
        >
          .mditoor.json
        </span>
      </div>

      <div className="mac-segmented" role="radiogroup" aria-label={t('storage.provider')}>
        {(['local', 's3'] as const).map(p => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={cfg.provider === p}
            onClick={() => setProvider(p)}
            className={`mac-segment${cfg.provider === p ? ' active' : ''}`}
          >
            {t(`storage.providers.${p}`)}
          </button>
        ))}
      </div>

      {isLocal && (
        <div className="space-y-4">
          <Field label={t('storage.local.mode')}>
            <div className="flex flex-col gap-2">
              {(['colocated', 'public'] as const).map(mode => (
                <label key={mode} className="flex items-start gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--text)' }}>
                  <input
                    type="radio"
                    name="local-mode"
                    checked={cfg.local.mode === mode}
                    onChange={() => setLocal('mode', mode)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span className="font-medium">{t(`storage.local.${mode}`)}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      {t(`storage.local.${mode}Hint`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>

          {cfg.local.mode === 'public' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('storage.local.dir')} hint={t('storage.local.dirHint')}>
                <input
                  type="text"
                  value={cfg.local.dir}
                  onChange={e => setLocal('dir', e.target.value)}
                  placeholder="public/images"
                  className={inputCls}
                />
              </Field>
              <Field label={t('storage.local.urlPrefix')} hint={t('storage.local.urlPrefixHint')}>
                <input
                  type="text"
                  value={cfg.local.urlPrefix}
                  onChange={e => setLocal('urlPrefix', e.target.value)}
                  placeholder="/images"
                  className={inputCls}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {!isLocal && (
        <div className="space-y-4">
          <Field label={t('storage.endpoint')} hint={t('storage.endpointHint')}>
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

          <Field label={t('storage.secretKey')} hint={t('storage.secretKeyHiddenHint')}>
            <input
              type="password"
              value={secretDraft}
              onChange={e => setSecretDraft(e.target.value)}
              onContextMenu={e => e.preventDefault()}
              placeholder={hasStoredSecret ? t('storage.secretKeyStoredPlaceholder') : '••••••••'}
              className={inputCls}
              autoComplete="new-password"
            />
          </Field>

          <Field label={t('storage.keyPrefix')} hint={t('storage.keyPrefixHint')}>
            <input
              type="text"
              value={cfg.s3.keyPrefix}
              onChange={e => setS3('keyPrefix', e.target.value)}
              placeholder="images/"
              className={inputCls}
            />
          </Field>

          <Field label={t('storage.publicUrl')} hint={t('storage.publicUrlHint')}>
            <input
              type="text"
              value={cfg.s3.publicUrlPrefix}
              onChange={e => setS3('publicUrlPrefix', e.target.value)}
              placeholder="https://cdn.example.com"
              className={inputCls}
            />
          </Field>
        </div>
      )}

      <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <label className="flex items-start gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--text)' }}>
          <input
            type="checkbox"
            checked={cfg.optimize.enabled}
            onChange={e => setOptimize('enabled', e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <span className="font-medium">{t('storage.optimize.enabled')}</span>
            <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>
              {t('storage.optimize.enabledHint')}
            </span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('storage.optimize.maxWidth')} hint={t('storage.optimize.maxWidthHint')}>
            <input
              type="number"
              min={0}
              step={100}
              value={cfg.optimize.maxWidth}
              onChange={e => setOptimize('maxWidth', Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className={inputCls}
            />
          </Field>
          {/* Quality is clamped on blur so typing "9" on the way to "90" isn't snapped to 40. */}
          <Field label={t('storage.optimize.quality')} hint={t('storage.optimize.qualityHint')}>
            <input
              type="number"
              min={40}
              max={100}
              value={cfg.optimize.quality}
              onChange={e => setOptimize('quality', Number(e.target.value))}
              onBlur={() => setOptimize('quality', Math.min(100, Math.max(40, Math.round(cfg.optimize.quality) || 82)))}
              className={inputCls}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={cfg.optimize.sharpen} onChange={e => setOptimize('sharpen', e.target.checked)} />
          {t('storage.optimize.sharpen')}
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
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
