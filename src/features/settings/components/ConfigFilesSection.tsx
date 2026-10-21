import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../workspace/store';
import { toast } from '../../../components/Toast';
import { IconAlert, IconChevronRight, IconCopy, IconFolder, IconSearch } from '../../../components/Icons';

interface ConfigFile { key: string; path: string; exists: boolean }
interface ConfigLocations { app_dir: string; app_files: ConfigFile[]; workspaces: ConfigFile[][] }

function parentDir(p: string) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

// The filter only earns its space once the list gets long.
const FILTER_FROM = 4;

/** Shows where every config file lives, with copy / reveal actions. Workspaces collapse to one line each. */
export function ConfigFilesSection() {
  const { t } = useTranslation();
  const { workspaces, activeId } = useStore();
  const [data, setData] = useState<ConfigLocations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // The active workspace starts open; the rest stay one line.
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeId ? [activeId] : []));
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

  const revealDir = (dir: string) => {
    revealItemInDir(dir).catch(e => toast.error(t('files.revealFailed'), String(e)));
  };

  const copy = (path: string) => {
    navigator.clipboard.writeText(path)
      .then(() => toast.info(t('files.copied'), path))
      .catch(e => toast.error(t('images.copyFailed'), String(e)));
  };

  const groups = useMemo(
    () => workspaces.map((w, i) => ({ workspace: w, files: data?.workspaces[i] ?? [] })),
    [data, workspaces],
  );
  const q = query.trim().toLowerCase();
  const visible = q
    ? groups.filter(g => g.workspace.name.toLowerCase().includes(q) || g.workspace.mdxPath.toLowerCase().includes(q))
    : groups;
  // While filtering, matches open so their files are visible straight away.
  const isOpen = (id: string) => Boolean(q) || open.has(id);
  const allOpen = visible.length > 0 && visible.every(g => open.has(g.workspace.id));

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const Row = ({ file, indent = false }: { file: ConfigFile; indent?: boolean }) => (
    <div className={`files-row${indent ? ' indent' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12.5px] font-semibold ui-mono flex-shrink-0" style={{ color: 'var(--text)' }}>
            {file.path.split(/[\\/]/).pop()}
          </span>
          {!file.exists && <span className="badge flex-shrink-0">{t('files.notCreated')}</span>}
          {file.key === 'config.key' && (
            <span className="badge badge-orange flex-shrink-0"><IconAlert size={11} />{t('files.private')}</span>
          )}
          <span className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>{t(`files.desc.${file.key.replace('.', '_')}`)}</span>
        </div>
        <p className="files-row-path ui-mono truncate dir-ltr" title={file.path}>{file.path}</p>
      </div>
      <div className="files-row-actions">
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
          <div className="files-group-head">
            <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{t('files.appGroup')}</span>
            <button
              className="toolbar-btn px-2 py-1 text-[11.5px] inline-flex items-center gap-1 ui-mono truncate dir-ltr min-w-0"
              onClick={() => revealDir(data.app_dir)}
              title={t('files.reveal')}
            >
              <IconFolder size={12} /><span className="truncate">{data.app_dir}</span>
            </button>
          </div>
          {data.app_files.map(f => <Row key={f.path} file={f} />)}

          {workspaces.length > 0 && (
            <div className="files-group-head" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                {t('files.workspacesGroup')} <span className="tab-count">{workspaces.length}</span>
              </span>
              <div className="flex-1" />
              {workspaces.length >= FILTER_FROM && (
                <div className="search-field files-filter">
                  <IconSearch size={13} />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('files.search')} aria-label={t('files.search')} />
                </div>
              )}
              {!q && workspaces.length > 1 && (
                <button
                  className="toolbar-btn px-2 py-1 text-[11.5px] flex-shrink-0"
                  onClick={() => setOpen(allOpen ? new Set() : new Set(workspaces.map(w => w.id)))}
                >
                  {allOpen ? t('files.collapseAll') : t('files.expandAll')}
                </button>
              )}
            </div>
          )}

          {visible.length === 0 && q && (
            <p className="px-[18px] py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('files.noMatch', { query })}</p>
          )}

          <div className="files-workspaces">
            {visible.map(({ workspace: w, files }) => {
              const expanded = isOpen(w.id);
              const missing = files.filter(f => !f.exists).length;
              return (
                <div key={w.id} className={`files-ws${expanded ? ' open' : ''}`}>
                  <div className="files-ws-head">
                    <button
                      type="button"
                      className="files-ws-toggle"
                      onClick={() => toggle(w.id)}
                      aria-expanded={expanded}
                      aria-controls={`files-ws-${w.id}`}
                    >
                      <IconChevronRight size={13} className="files-ws-chevron" mirror />
                      <span aria-hidden="true">{w.icon}</span>
                      <span className="text-[13px] font-semibold truncate flex-shrink-0 max-w-[40%]" style={{ color: 'var(--text)' }}>{w.name}</span>
                      {w.id === activeId && <span className="badge badge-accent flex-shrink-0">{t('files.current')}</span>}
                      <span className="files-ws-path ui-mono truncate dir-ltr" title={w.mdxPath}>{w.mdxPath}</span>
                      <span className="files-ws-summary">
                        {missing > 0 ? t('files.missingCount', { count: missing }) : t('files.fileCount', { count: files.length })}
                      </span>
                    </button>
                    <button className="icon-btn icon-btn-sm flex-shrink-0" onClick={() => revealDir(w.mdxPath)} title={t('files.openFolder')} aria-label={t('files.openFolder')}>
                      <IconFolder size={14} />
                    </button>
                  </div>
                  {expanded && (
                    <div id={`files-ws-${w.id}`} className="mac-fade-slide">
                      {files.map(f => <Row key={f.path} file={f} indent />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="px-[18px] py-3 text-[11.5px]" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
            {t('files.localStorageNote')}
          </p>
        </>
      )}
    </section>
  );
}
