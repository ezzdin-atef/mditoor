import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../../components/AppLogo';
import { IconAlert, IconCheck, IconCloudDown, IconRefresh } from '../../components/Icons';
import { useUpdater, type UpdateStatus } from './store';

function useRelativeTime(timestamp: number | null) {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (timestamp == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [timestamp]);
  if (timestamp == null) return null;
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  const minutes = Math.round((timestamp - now) / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  return rtf.format(Math.round(minutes / 60), 'hour');
}

function StatusIcon({ status }: { status: UpdateStatus }) {
  if (status === 'checking' || status === 'downloading' || status === 'ready') return <span className="update-spinner" aria-hidden="true" />;
  if (status === 'upToDate')  return <span style={{ color: 'var(--green)' }}><IconCheck size={13} /></span>;
  if (status === 'available') return <span className="update-dot" aria-hidden="true" />;
  if (status === 'error')     return <span style={{ color: 'var(--red)' }}><IconAlert size={13} /></span>;
  return null;
}

export function UpdatesSection({ autoCheck, onAutoCheckChange }: {
  autoCheck: boolean;
  onAutoCheckChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { status, currentVersion, update, progress, error, lastChecked, reveal, loadVersion, checkForUpdates, installUpdate } = useUpdater();
  const checkedAgo = useRelativeTime(lastChecked);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => { void loadVersion(); }, [loadVersion]);

  // Arriving from the title bar pill or the palette: bring the card into view.
  useEffect(() => {
    if (!reveal) return;
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    useUpdater.setState({ reveal: false });
  }, [reveal]);

  const installing = status === 'downloading' || status === 'ready';
  const canInstall = update != null && (status === 'available' || status === 'error' || installing);

  let headline: string;
  switch (status) {
    case 'checking':    headline = t('updater.checking'); break;
    case 'upToDate':    headline = t('updater.upToDate'); break;
    case 'available':   headline = t('updater.available', { version: update?.version }); break;
    case 'downloading': headline = progress == null
      ? t('updater.downloading')
      : t('updater.downloadingPct', { pct: Math.round(progress * 100) }); break;
    case 'ready':       headline = t('updater.restarting'); break;
    case 'error':       headline = update ? t('updater.installFailed') : t('updater.failed'); break;
    default:            headline = t('updater.idle');
  }

  const detail = status === 'error'
    ? t('updater.errorHint')
    : checkedAgo ? t('updater.lastChecked', { when: checkedAgo }) : t('updater.neverChecked');

  return (
    <section ref={ref} id="updates" className="panel" style={{ scrollMarginTop: 76 }} aria-labelledby="updates-title">
      <div className="update-hero">
        <AppLogo size={44} className="flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 id="updates-title" className="text-[15px] font-semibold" style={{ letterSpacing: '-0.005em' }}>{t('app.name')}</h3>
            <span className="update-version" dir="ltr">{currentVersion ? `v${currentVersion}` : t('updater.devBuild')}</span>
          </div>
          <p className="update-status" role="status" aria-live="polite">
            <StatusIcon status={status} />
            <span className="truncate">{headline}</span>
          </p>
          <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--text-faint)' }} title={status === 'error' && error ? error : undefined}>
            {detail}
          </p>
        </div>
        <div className="flex-shrink-0">
          {canInstall ? (
            <button onClick={installUpdate} disabled={installing} className="mac-btn mac-btn-primary">
              <IconCloudDown size={14} />{status === 'error' ? t('common.retry') : t('updater.install')}
            </button>
          ) : (
            <button onClick={() => void checkForUpdates()} disabled={status === 'checking'} className="mac-btn">
              <IconRefresh size={14} />{t('updater.check')}
            </button>
          )}
        </div>
      </div>

      {installing && (
        <div className="update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress == null ? undefined : Math.round(progress * 100)} aria-label={headline}>
          <div className={progress == null ? 'update-progress-bar indeterminate' : 'update-progress-bar'} style={progress == null ? undefined : { transform: `scaleX(${progress})` }} />
        </div>
      )}

      {update && (status === 'available' || installing) && (
        <ReleaseNotes version={update.version} date={update.date} body={update.body} />
      )}

      <div className="settings-row" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">{t('updater.autoCheck')}</p>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{t('updater.autoCheckHint')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoCheck}
          aria-label={t('updater.autoCheck')}
          onClick={() => onAutoCheckChange(!autoCheck)}
          className="mac-toggle flex-shrink-0"
          style={{ background: autoCheck ? 'var(--accent)' : 'var(--surface-3)' }}
        >
          <div className="mac-toggle-knob" style={{ insetInlineStart: autoCheck ? '18px' : '2px' }} />
        </button>
      </div>
    </section>
  );
}

function ReleaseNotes({ version, date, body }: { version: string; date?: string; body?: string }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const notes = body?.trim();
  const long = (notes?.split('\n').length ?? 0) > 6;
  const published = date ? new Date(date.replace(' ', 'T').split('.')[0] + 'Z') : null;

  return (
    <div className="update-notes">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[13px] font-semibold">{t('updater.whatsNew', { version })}</p>
        {published && !Number.isNaN(published.getTime()) && (
          <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
            {published.toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      {notes ? (
        <>
          <div className={`update-notes-body${long && !expanded ? ' clamped' : ''}`} dir="auto">{notes}</div>
          {long && (
            <button type="button" onClick={() => setExpanded(v => !v)} className="update-notes-toggle">
              {expanded ? t('updater.showLess') : t('updater.showMore')}
            </button>
          )}
        </>
      ) : (
        <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{t('updater.noNotes')}</p>
      )}
    </div>
  );
}
