import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../workspace/store';
import { toast } from '../../../components/Toast';
import { IconAlert, IconCopy, IconFolder } from '../../../components/Icons';

interface ConfigFile { key: string; path: string; exists: boolean }
interface ConfigLocations { app_dir: string; app_files: ConfigFile[]; workspaces: ConfigFile[][] }

function parentDir(p: string) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

/** Shows where every config file lives, with copy / reveal actions. */
export function ConfigFilesSection() {
  const { t } = useTranslation();
  const { workspaces } = useStore();
  const [data, setData] = useState<ConfigLocations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paths = workspaces.map(w => w.mdxPath);

  useEffect(() => {
    invoke<ConfigLocations>('config_locations', { workspacePaths: paths })
      .then(setData)
      .catch(e => setError(String(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join('|')]);

  const reveal = (file: ConfigFile) => {
    // Missing files can't be selected, so open the folder that would hold them.
    revealItemInDir(file.exists ? file.path : parentDir(file.path))
      .catch(e => toast.error(t('files.revealFailed'), String(e)));
  };

  const copy = (path: string) => {
    navigator.clipboard.writeText(path)
      .then(() => toast.info(t('files.copied'), path))
      .catch(e => toast.error(t('images.copyFailed'), String(e)));
  };

  const Row = ({ file }: { file: ConfigFile }) => (
    <div className="settings-row" style={{ alignItems: 'flex-start' }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold ui-mono" style={{ color: 'var(--text)' }}>
            {file.path.split(/[\\/]/).pop()}
          </span>
          {!file.exists && <span className="badge">{t('files.notCreated')}</span>}
          {file.key === 'config.key' && (
            <span className="badge badge-orange"><IconAlert size={11} />{t('files.private')}</span>
          )}
        </div>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t(`files.desc.${file.key.replace('.', '_')}`)}</p>
        <p className="text-[11.5px] mt-1 ui-mono truncate dir-ltr" style={{ color: 'var(--text-faint)' }} title={file.path}>{file.path}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button className="icon-btn icon-btn-sm" onClick={() => copy(file.path)} title={t('files.copyPath')} aria-label={t('files.copyPath')}>
          <IconCopy size={14} />
        </button>
        <button className="icon-btn icon-btn-sm" onClick={() => reveal(file)} title={t('files.reveal')} aria-label={t('files.reveal')}>
          <IconFolder size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-header" style={{ padding: '12px 18px' }}>
        <div>
          <h2 className="text-[12px] font-bold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{t('files.title')}</h2>
          <p className="text-[12px] mt-1" style={{ color: 'var(--text-faint)' }}>{t('files.subtitle')}</p>
        </div>
      </div>

      {error && <p className="px-[18px] py-3 text-[12px]" style={{ color: 'var(--red)' }}>{error}</p>}
      {!data && !error && <div className="p-[18px]"><div className="skeleton" style={{ height: 80 }} /></div>}

      {data && (
        <>
          <div className="px-[18px] pt-4 pb-1 flex items-center gap-2">
            <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{t('files.appGroup')}</span>
            <button
              className="toolbar-btn px-2 py-1 text-[11.5px] inline-flex items-center gap-1 ui-mono truncate dir-ltr"
              onClick={() => revealItemInDir(data.app_dir).catch(e => toast.error(t('files.revealFailed'), String(e)))}
              title={t('files.reveal')}
            >
              <IconFolder size={12} />{data.app_dir}
            </button>
          </div>
          {data.app_files.map(f => <Row key={f.path} file={f} />)}

          {workspaces.map((w, i) => (
            <div key={w.id}>
              <div className="px-[18px] pt-4 pb-1 flex items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                <span aria-hidden="true">{w.icon}</span>
                <span className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>{w.name}</span>
              </div>
              {(data.workspaces[i] ?? []).map(f => <Row key={f.path} file={f} />)}
            </div>
          ))}

          <p className="px-[18px] py-3 text-[11.5px]" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
            {t('files.localStorageNote')}
          </p>
        </>
      )}
    </section>
  );
}
